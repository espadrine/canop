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
    this.canopClient.receiveUpdate('' + event.data);
    //if (update) {
    //  this.editor.off('change', this.editorChange);
    //  this.editor.setValue(update.M);
    //  this.canopClient.reset(update.M, update.B);
    //  this.editor.on('change', this.editorChange);
    //} else if (update.D !== undefined) {
    //  var change = canop.operationFromProtocol(update);
    //  var minimalDelta = this.merge(change);
    //  //this.resetEditor();
    //  this.updateEditor(minimalDelta);
    //}
  },

  remoteUpdate: function CCHremoteUpdate(update, prevLocal, prevSent) {
    var minimalDelta = this.merge(update, prevLocal, prevSent);
    //this.resetEditor();
    this.updateEditor(minimalDelta);
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
    if (this.canopClient.local.list.length > 0) {
      console.log('> ' + JSON.stringify(this.canopClient.local.toProtocol()));
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

  // Takes a Client and an operation.
  // Returns a list of atomic operations.
  merge: function CCHmerge(change, prevLocal, prevSent) {
    // If all operations were sent from here, ignore them.
    var allFromHere = true;
    for (var i = 0; i < change.list.length; i++) {
      if (change.list[i].mark[1] !== this.canopClient.localId) {
        allFromHere = false;
        break;
      }
    }

    if (allFromHere) {
      return [];
    } else {
      var minimalDelta = this.editorUndoChanges(prevLocal, prevSent);
      this.editorDoChanges(change, minimalDelta);
      return minimalDelta;
    }
  },

  editorUndoChanges: function CCHeditorUndoChanges(prevLocal, prevSent) {
    var delta = [];
    for (var i = 0; i < prevLocal.list.length; i++) {
      delta.push(this.inverseAtomicOperation(prevLocal.list[i]));
    }
    for (var i = 0; i < prevSent.list.length; i++) {
      delta.push(this.inverseAtomicOperation(prevSent.list[i]));
    }
    return delta;
  },

  editorDoChanges: function CCHeditorDoChanges(op, delta) {
    for (var i = 0; i < op.list.length; i++) {
      delta.push(op.list[i]);
    }
    for (var i = 0; i < this.canopClient.sent.list.length; i++) {
      delta.push(this.canopClient.sent.list[i]);
    }
    for (var i = 0; i < this.canopClient.local.list.length; i++) {
      delta.push(this.canopClient.local.list[i]);
    }
    return delta;
  },

  inverseAtomicOperation: function CCHinverseAtomicOperation(operation) {
    var inverse = operation.dup();
    // Insertions become deletions and vice-versa.
    inverse.tag = (inverse.tag === canop.TAG.add)? canop.TAG.remove:
      canop.TAG.add;
    return inverse;
  },

  // Takes a list of atomic operations.
  updateEditor: function CCHupdateEditor(delta) {
    this.editor.off('change', this.editorChange);
    this.applyDelta(delta);
    this.editor.on('change', this.editorChange);
  },

  applyDelta: function CCHapplyDelta(delta) {
    var cursor = this.editor.indexFromPos(this.editor.getCursor());
    for (var i = 0; i < delta.length; i++) {
      var change = delta[i];
      if (change.tag === canop.TAG.set) {
        this.editor.setValue(change.key);
      } else if (change.tag === canop.TAG.add) {
        this.editor.replaceRange(change.value, this.editor.posFromIndex(change.key));
      } else if (change.tag === canop.TAG.remove) {
        var from = this.editor.posFromIndex(change.key);
        var to = this.editor.posFromIndex(change.key + change.value.length);
        this.editor.replaceRange('', from, to);
      }
      if (change.mark[1] !== this.canopClient.localId) {
        cursor = canop.modifyOffset(cursor, change);
      }
    }
    this.editor.setCursor(this.editor.posFromIndex(cursor));
  }
};


exports.CanopCodemirrorHook = CanopCodemirrorHook;
}(this));
