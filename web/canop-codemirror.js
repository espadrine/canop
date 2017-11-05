(function(exports, undefined) {

var canop = exports.canop;

// client: a canop.Client instance.
// editor: a CodeMirror instance.
// options: (planned)
// - path: list determining the location of the corresponding string in the JSON
//   object.
function CanopCodemirror(client, editor) {
  this.canopClient = client;
  this.editor = editor;

  this.editorChange = this.editorChange.bind(this);
  this.remoteChange = this.remoteChange.bind(this);
  this.cursorActivity = this.cursorActivity.bind(this);
  this.signalReceive = this.signalReceive.bind(this);

  this.canopClient.on('change', this.remoteChange);
  this.canopClient.on('signal', this.signalReceive);
  this.clientSelectionWidgets = Object.create(null);
}

CanopCodemirror.prototype = {
  remoteChange: function canopCodemirrorRemoteUpdate(event) {
    this.updateEditor(event.changes, event.posChanges);
  },

  editorChange: function canopCodemirrorEditorChange(editor, changes) {
    // The codemirror positions in `changes` correspond to before the change's
    // execution. However, the `editor` has the changes applied, so that
    // `indexFromPos` only returns the right answer for positions after the
    // changes are applied.
    var actions =  [];
    var indexFromPos = function(pos) { return editor.indexFromPos(pos); };
    for (var i = changes.length - 1; i >= 0; i--) {
      var change = changes[i];
      var from = change.from;
      var to = change.to;
      var added = change.text.join('\n');
      var removed = change.removed.join('\n');
      indexFromPos = this.updateIdxFromCmPos(indexFromPos, change, added, removed);
      var fromIdx = indexFromPos(from);
      if (removed.length > 0) {
        actions.push([canop.action.stringRemove, [], fromIdx, removed]);
      }
      if (added.length > 0) {
        actions.push([canop.action.stringAdd, [], fromIdx, added]);
      }
    }
    this.canopClient.actAtomically(actions.reverse());
  },

  // Compare codemirror positions a and b.
  cmpCmPos: function canopCompareCodemirrorPosition(a, b) {
    if (a.line < b.line) { return -1; }
    if (a.line > b.line) { return  1; }
    if (a.ch < b.ch)     { return -1; }
    if (a.ch > b.ch)     { return  1; }
    return 0;
  },

  // Is the codemirror position a before b?
  cmPosLe: function canopCodemirrorPositionLessOrEqual(a, b) {
    return this.cmpCmPos(a, b) <= 0;
  },

  updateIdxFromCmPos: function canopUpdateIndexFromCodemirrorPosition(
  indexFromPos, change, added, removed) {
    var self = this;
    return function(pos) {
      if (self.cmPosLe(pos, change.from)) { return indexFromPos(pos); }
      else if (self.cmPosLe(change.to, pos)) {
        var ch = 0;
        if (change.to.line < pos.line) {
          ch = pos.ch;
        } else if (change.text.length <= 1) {
          ch = pos.ch - (change.to.ch - change.from.ch) + added.length;
        } else {
          var lastLineAdded = change.text[change.text.length - 1];
          ch = pos.ch - change.to.ch + lastLineAdded.length;
        }
        return indexFromPos({
          line: pos.line + change.text.length - 1
            - (change.to.line - change.from.line),
          ch: ch,
        }) + removed.length - added.length;
      } else if (change.from.line === pos.line) {
        return indexFromPos(change.from) - change.from.ch + pos.ch;
      } else {
        return indexFromPos(change.from)
          + change.removed.slice(0, pos.line - change.from.line).join('\n').length
          + pos.ch + 1;
      }
    };
  },

  cursorActivity: function canopCodemirrorCursorActivity(editor) {
    var self = this;
    var selections = self.editor.listSelections().map(function(selection) {
      return [
        self.editor.indexFromPos(selection.head),
        self.editor.indexFromPos(selection.anchor),
      ];
    });
    self.canopClient.signal({sel: selections});
  },

  resetEditor: function canopCodemirrorResetEditor() {
    this.editor.off('changes', this.editorChange);
    this.editor.off('cursorActivity', this.cursorActivity);
    var cursor = this.editor.getCursor();
    this.editor.setValue('' + this.canopClient);
    this.editor.setCursor(cursor);
    this.editor.on('cursorActivity', this.cursorActivity);
    this.editor.on('changes', this.editorChange);
  },

  // Takes a list of AtomicOperations and a list of PosChanges.
  updateEditor: function canopCodemirrorUpdateEditor(delta, posChanges) {
    this.editor.off('changes', this.editorChange);
    this.editor.off('cursorActivity', this.cursorActivity);
    var selections = this.getSelections();
    this.applyDelta(delta);
    this.setSelections(posChanges, selections);
    this.editor.on('cursorActivity', this.cursorActivity);
    this.editor.on('changes', this.editorChange);
  },

  applyDelta: function canopCodemirrorApplyDelta(delta) {
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

  getSelections: function canopCodemirrorGetSelections() {
    var cmSelections = this.editor.listSelections();
    var selections = [];
    for (var i = 0; i < cmSelections.length; i++) {
      var cmSelection = cmSelections[i];
      selections.push({
        anchor: this.editor.indexFromPos(cmSelection.anchor),
        head:   this.editor.indexFromPos(cmSelection.head),
      });
    }
    return selections;
  },

  setSelections: function canopCodemirrorSetSelections(posChanges, oldSelections) {
    var cmSelections = [];
    for (var i = 0; i < oldSelections.length; i++) {
      var oldSelection = oldSelections[i];
      cmSelections.push({
        anchor: canop.changePosition(this.editor.posFromIndex(oldSelection.anchor), posChanges, true),
        head:   canop.changePosition(this.editor.posFromIndex(oldSelection.head), posChanges, true),
      });
    }
    this.editor.setSelections(cmSelections);
  },

  // UI management to show selection from other participants.

  signalReceive: function canopCodemirrorSignalReceive(event) {
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
  addSelection: function canopCodemirrorAddSelection(selection, name) {
    var widgets = [this.addUiCursor(selection[0], name)];
    if (selection[0] !== selection[1]) {
      widgets.push(this.addUiSelection(selection, name));
    }
    return widgets;
  },

  // Return the CodeMirror bookmark associated with the cursor.
  addUiCursor: function canopCodemirrorAddUiCursor(offset, name) {
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
  addUiSelection: function canopCodemirrorAddUiSelection(selection, name) {
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
  rgbFromLch: function canopCodemirrorRgbFromLch(luma, chroma, hue) {
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
  hueFromName: function canopCodemirrorColorFromName(name) {
    var hue = 0;
    for (var i = 0; i < name.length; i++) {
      hue = (hue + name.charCodeAt(i)) % 360;
    }
    // 93 is a prime number close to a quarter of 360.
    return (hue * 93) % 360;
  },

  // Return a CSS rgb(…) string for each string name, with the same luma, and
  // such that small differences in the string yield very different colors.
  colorFromName: function canopCodemirrorColorFromName(name, luma) {
    if (luma === undefined) { luma = 0.7; }
    return this.rgbFromLch(luma, 0.6, this.hueFromName(name));
  }
};


canop.ui = canop.ui || {};
canop.ui.codemirror = function(client, editor) {
  return new CanopCodemirror(client, editor);
};

}(this));
