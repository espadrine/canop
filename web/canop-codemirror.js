(function(exports, undefined) {

var canop = exports.canop;
var RECONNECTION_INTERVAL = 256;  // in ms. Increases exponentially to 10min.

// editor: a CodeMirror instance.
// options:
// - url: location of websocket. Defaults to ws://<dns>/websocket.
// - error: function triggered when the websocket errors.
// - open: function triggered when the websocket opens.
// - close: function triggered when the websocket closes.
//   (You can also rely on .canopClient.on('unsyncable', …)
// - reconnect: if true, automatically reconnect when disconnected.
function CanopCodemirrorHook(editor, options) {
  options = options || {};
  options.url = options.url ||
    // Trick: use the end of either http: or https:.
    'ws' + window.location.protocol.slice(4) + '//' +
    window.location.host + '/websocket';

  this.editor = editor;
  var self = this;
  this.canopClient = new canop.Client({
    send: function(msg) {
      if (self.socket === undefined ||
          self.socket.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not open for business");
      }
      self.socket.send(msg);
    }
  });
  this.url = "" + options.url;
  this.socket = null;
  this.reconnect = (options.reconnect === undefined)? true: !!options.reconnect;
  this.reconnectionInterval = RECONNECTION_INTERVAL;

  this.socketReceive = this.socketReceive.bind(this);
  this.editorChange = this.editorChange.bind(this);
  this.remoteChange = this.remoteChange.bind(this);
  this.cursorActivity = this.cursorActivity.bind(this);
  this.signalReceive = this.signalReceive.bind(this);

  this.canopClient.on('change', this.remoteChange);
  this.canopClient.on('signal', this.signalReceive);
  this.clientSelectionWidgets = Object.create(null);
  this.connect(options);
}

CanopCodemirrorHook.prototype = {
  connect: function CCHconnect(options) {
    console.log('Connecting…');
    var self = this;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', this.socketReceive);
    this.socket.addEventListener('close', function(e) {
      self.canopClient.emit('unsyncable');
      if (self.reconnect) {
        setTimeout(function() { self.connect(options); },
          self.reconnectionInterval);
        if (self.reconnectionInterval <= 1000 * 60 * 10) {
          self.reconnectionInterval *= 2;
        }
      }
    });
    this.socket.addEventListener('open', function() {
      self.reconnectionInterval = RECONNECTION_INTERVAL;
      self.canopClient.emit('syncing');
    });
    if (options.error) { this.socket.addEventListener('error', options.error); }
    if (options.open) { this.socket.addEventListener('open', options.open); }
    if (options.close) { this.socket.addEventListener('close', options.close); }
  },

  socketReceive: function CCHsocketReceive(event) {
    console.log('< ' + event.data);
    this.canopClient.receive('' + event.data);
  },

  remoteChange: function CCHremoteUpdate(event) {
    this.updateEditor(event.changes, event.posChanges);
  },

  editorChange: function CCHeditorChange(editor, change, actions) {
    var actions = actions || [];
    var from = change.from;
    var to = change.to;
    var added = change.text.join('\n');
    var removed = change.removed.join('\n');
    var fromIdx = editor.indexFromPos(from);
    if (removed.length > 0) {
      actions.push([canop.action.stringRemove, [], fromIdx, removed]);
    }
    if (added.length > 0) {
      actions.push([canop.action.stringAdd, [], fromIdx, added]);
    }
    if (change.next) {
      this.editorChange(editor, change.next, actions);
    } else {
      this.canopClient.actAtomically(actions);
    }
  },

  cursorActivity: function CCHcursorActivity(editor) {
    var self = this;
    var selections = self.editor.listSelections().map(function(selection) {
      return [
        self.editor.indexFromPos(selection.head),
        self.editor.indexFromPos(selection.anchor),
      ];
    });
    self.canopClient.signal({sel: selections});
  },

  resetEditor: function CCHresetEditor() {
    this.editor.off('change', this.editorChange);
    this.editor.off('cursorActivity', this.cursorActivity);
    var cursor = this.editor.getCursor();
    this.editor.setValue('' + this.canopClient);
    this.editor.setCursor(cursor);
    this.editor.on('cursorActivity', this.cursorActivity);
    this.editor.on('change', this.editorChange);
  },

  // Takes a list of AtomicOperations and a list of PosChanges.
  updateEditor: function CCHupdateEditor(delta, posChanges) {
    this.editor.off('change', this.editorChange);
    this.editor.off('cursorActivity', this.cursorActivity);
    var cursor = this.editor.indexFromPos(this.editor.getCursor());
    this.applyDelta(delta);
    this.updateCursor(posChanges, cursor);
    this.editor.on('cursorActivity', this.cursorActivity);
    this.editor.on('change', this.editorChange);
  },

  applyDelta: function CCHapplyDelta(delta) {
    for (var i = 0; i < delta.length; i++) {
      var change = delta[i];
      if (change[1] === canop.action.set) {
        this.editor.setValue(change[2]);
      } else if (change[1] === canop.action.stringAdd) {
        this.editor.replaceRange(change[3], this.editor.posFromIndex(change[2]));
      } else if (change[1] === canop.action.stringRemove) {
        var from = this.editor.posFromIndex(change[2]);
        var to = this.editor.posFromIndex(change[2] + change[3].length);
        this.editor.replaceRange('', from, to);
      }
    }
  },

  updateCursor: function CCHupdateCursor(posChanges, oldCursor) {
    cursor = canop.changePosition(oldCursor, posChanges, true);
    this.editor.setCursor(this.editor.posFromIndex(cursor));
  },

  // UI management to show selection from other participants.

  signalReceive: function CCHsignalReceive(event) {
    var clientId = event.clientId;
    var data = event.data;
    this.clientSelectionWidgets[clientId] =
      this.clientSelectionWidgets[clientId] || [];

    // Clear existing widgets.
    var widgets = this.clientSelectionWidgets[clientId];
    for (var i = 0; i < widgets.length; i++) {
      var widget = widgets[i];
      widget.clear();
    }

    // Set new widgets.
    if (data !== undefined && data.sel !== undefined) {
      var selections = data.sel;
      for (var i = 0; i < selections.length; i++) {
        var selection = selections[i];
        // TODO: use a signaled name instead of the clientId.
        var widgets = this.addSelection(selection, clientId);
        this.clientSelectionWidgets[clientId] =
          this.clientSelectionWidgets[clientId].concat(widgets);
      }
    }
  },

  // Return a list of widgets that got added.
  addSelection: function CCHaddSelection(selection, name) {
    var widgets = [this.addUiCursor(selection[0], name)];
    if (selection[0] !== selection[1]) {
      widgets.push(this.addUiSelection(selection, name));
    }
    return widgets;
  },

  // Return the CodeMirror bookmark associated with the cursor.
  addUiCursor: function CCHaddUiCursor(offset, name) {
    var pos = this.editor.posFromIndex(offset);
    var coords = this.editor.cursorCoords(pos);
    var domCursor = document.createElement("span");
    var color = this.colorFromName(name.toString());
    domCursor.style.backgroundColor = color;
    domCursor.style.width = "2px";
    domCursor.style.marginLeft = "-1px";
    domCursor.style.position = "absolute";
    domCursor.style.height = (coords.bottom - coords.top) + "px";
    // Show the name in a colorful rectangle above the cursor.
    var domName = document.createElement("span");
    domName.style.display = "none";
    domName.style.padding = "0 0.7em";
    domName.style.borderRadius = "3px";
    domName.style.backgroundColor = color;
    domName.textContent = name;
    domCursor.appendChild(domName);
    domCursor.addEventListener("mouseenter", function() {
      domName.style.display = "inline";
    });
    domCursor.addEventListener("mouseleave", function() {
      domName.style.display = "none";
    });
    return this.editor.setBookmark(pos, { widget: domCursor, insertLeft: true });
  },

  // selection: list of two offsets.
  // Returns a CodeMirror mark.
  addUiSelection: function CCHaddUiSelection(selection, name) {
    var color = this.colorFromName(name.toString(), 0.9);
    if (selection[0] < selection[1]) {
      var startIdx = selection[0];
      var endIdx = selection[1];
    } else {
      var startIdx = selection[1];
      var endIdx = selection[0];
    }
    var startPos = this.editor.posFromIndex(startIdx);
    var endPos = this.editor.posFromIndex(endIdx);
    return this.editor.markText(startPos, endPos,
      {css: "background-color:" + color});
  },

  // luma and chroma are between 0 and 1, hue between 0 and 360.
  // Return a CSS rgb(…) string.
  rgbFromLch: function CCHrgbFromLch(luma, chroma, hue) {
    var hue6 = hue / 60;
    var x = chroma * (1 - Math.abs((hue6 % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hue6 >= 5) {
      r = chroma; g = 0; b = x;
    } else if (hue6 >= 4) {
      r = x; g = 0; b = chroma;
    } else if (hue6 >= 3) {
      r = 0; g = x; b = chroma;
    } else if (hue6 >= 2) {
      r = 0; g = chroma; b = x;
    } else if (hue6 >= 1) {
      r = x; g = chroma; b = 0;
    } else if (hue6 >= 0) {
      r = chroma; g = x; b = 0;
    }
    var m = luma - (0.3 * r + 0.59 * g + 0.11 * b);
    r = ((r + m) * 256) | 0;
    g = ((g + m) * 256) | 0;
    b = ((b + m) * 256) | 0;
    return "rgb(" + r + "," + g + "," + b + ")";
  },

  // name: string. Returns a hue from 0 to 360
  // Small differences in the string yield very different colors.
  hueFromName: function CCHcolorFromName(name) {
    var hue = 0;
    for (var i = 0; i < name.length; i++) {
      hue = (hue + name.charCodeAt(i)) % 360;
    }
    // 93 is a prime number close to a quarter of 360.
    return (hue * 93) % 360;
  },

  // Return a CSS rgb(…) string for each string name, with the same luma, and
  // such that small differences in the string yield very different colors.
  colorFromName: function CCHcolorFromName(name, luma) {
    if (luma === undefined) { luma = 0.7; }
    return this.rgbFromLch(luma, 0.6, this.hueFromName(name));
  }
};


exports.CanopCodemirrorHook = CanopCodemirrorHook;
}(this));
