(function(exports, undefined) {

var canop = exports.canop;

function CanopCodemirrorHook(editor, options) {
  options = options || {};
  options.channelName = options.channelName || 'text';

  this.editor = editor;
  this.canopClient = new canop.Client();
  this.channelName = options.channelName;
  this.socket = null;

  this.socketReceive = this.socketReceive.bind(this);
  this.editorChange = this.editorChange.bind(this);
  this.remoteUpdate = this.remoteUpdate.bind(this);

  this.canopClient.onUpdate(this.remoteUpdate, {path: [], type: String});
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
    this.canopClient.clientReceive('' + event.data);
    this.send();
  },

  remoteUpdate: function CCHremoteUpdate(update, posChanges) {
    this.updateEditor(update.list, posChanges);
  },

  editorChange: function CCHeditorChange(editor, change) {
    var from = change.from;
    var to = change.to;
    var text = change.text.join('\n');
    var removed = change.removed.join('\n');
    if (removed.length > 0) {
      this.canopClient.delete(editor.indexFromPos(from), removed);
    }
    if (text.length > 0) {
      this.canopClient.insert(editor.indexFromPos(from), text);
    }
    if (change.next) {
      this.editorChange(editor, change.next);
    } else {
      this.send();
    }
  },

  send: function CCHsend() {
    // Don't send more operations when there are non-canonized operations.
    if (this.canopClient.sent.list.length > 0) { return; }
    if (this.canopClient.local.list.length > 0) {
      console.log('> ' + JSON.stringify(this.canopClient.local.toProtocol()));
      //var data = JSON.stringify(this.canopClient.local.toProtocol());
      //setTimeout(() => this.socket.send(data),2000)
      this.socket.send(JSON.stringify(this.canopClient.local.toProtocol()));
      this.canopClient.localToSent();
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
      if (change.action === canop.action.set) {
        this.editor.setValue(change.key);
      } else if (change.action === canop.action.add) {
        this.editor.replaceRange(change.value, this.editor.posFromIndex(change.key));
      } else if (change.action === canop.action.remove) {
        var from = this.editor.posFromIndex(change.key);
        var to = this.editor.posFromIndex(change.key + change.value.length);
        this.editor.replaceRange('', from, to);
      }
    }
  },

  updateCursor: function CCHupdateCursor(posChanges, oldCursor) {
    cursor = canop.changeKey(oldCursor, posChanges, true);
    this.editor.setCursor(this.editor.posFromIndex(cursor));
  }
};


exports.CanopCodemirrorHook = CanopCodemirrorHook;
}(this));
