(function(exports, undefined) {

var canop = exports.canop;

function CanopCodemirrorHook(editor, options) {
  options = options || {};
  options.channelName = options.channelName || 'text';

  this.editor = editor;
  var self = this;
  this.canopClient = new canop.Client({
    send: function(msg) {
      if (self.socket === undefined) {
        throw new Error('Socket not initialized but data is sent through it');
      }
      self.socket.send(msg);
    },
  });
  this.channelName = options.channelName;
  this.socket = null;

  this.socketReceive = this.socketReceive.bind(this);
  this.editorChange = this.editorChange.bind(this);
  this.remoteChange = this.remoteChange.bind(this);

  this.canopClient.on('change', this.remoteChange);
  this.connect(options);
}

CanopCodemirrorHook.prototype = {
  connect: function CCHconnect(options) {
    this.socket = new WebSocket(
      // Trick: use the end of either http: or https:.
      'ws' + window.location.protocol.slice(4) + '//' +
        window.location.host +
        '/$websocket:' + this.channelName);

    this.socket.addEventListener('message', this.socketReceive);
    this.socket.addEventListener('error', options.error);
    this.socket.addEventListener('close', options.close);
    this.socket.addEventListener('open', options.open);
  },

  socketReceive: function CCHsocketReceive(event) {
    console.log('< ' + event.data);
    this.canopClient.receive('' + event.data);
  },

  remoteChange: function CCHremoteUpdate(event) {
    this.updateEditor(event.changes, event.posChanges);
  },

  editorChange: function CCHeditorChange(editor, change) {
    var from = change.from;
    var to = change.to;
    var text = change.text.join('\n');
    var removed = change.removed.join('\n');
    if (removed.length > 0) {
      this.canopClient.remove([], editor.indexFromPos(from), removed);
    }
    if (text.length > 0) {
      this.canopClient.add([], editor.indexFromPos(from), text);
    }
    if (change.next) {
      this.editorChange(editor, change.next);
    }
  },

  resetEditor: function CCHresetEditor() {
    this.editor.off('change', this.editorChange);
    var cursor = this.editor.getCursor();
    this.editor.setValue('' + this.canopClient);
    this.editor.setCursor(cursor);
    this.editor.on('change', this.editorChange);
  },

  // Takes a list of AtomicOperations and a list of PosChanges.
  updateEditor: function CCHupdateEditor(delta, posChanges) {
    this.editor.off('change', this.editorChange);
    var cursor = this.editor.indexFromPos(this.editor.getCursor());
    this.applyDelta(delta);
    this.updateCursor(posChanges, cursor);
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
  }
};


exports.CanopCodemirrorHook = CanopCodemirrorHook;
}(this));
