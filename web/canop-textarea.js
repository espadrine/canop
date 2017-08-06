(function(exports, undefined) {

var canop = exports.canop;

// client: a canop.Client instance.
// editor: a DOM textarea.
// options: (planned)
// - path: list determining the location of the corresponding string in the JSON
//   object.
function CanopTextarea(client, editor) {
  this.canopClient = client;
  this.editor = editor;

  this.editorChange = this.editorChange.bind(this);
  this.remoteChange = this.remoteChange.bind(this);

  this.canopClient.on('change', this.remoteChange);
  this.editor.addEventListener('input', this.editorChange);
}

CanopTextarea.prototype = {
  remoteChange: function canopTextareaRemoteUpdate(event) {
    console.log('remote', event.changes);
    this.updateEditor(event.changes, event.posChanges);
  },

  editorChange: function canopTextareaEditorChange(event) {
    var type = event.inputType;
    var data = event.data;
    var value = this.editor.value;
    var actions = [];
    if (type === "insertText") {
      var selStart = this.editor.selectionStart;
      var selEnd = this.editor.selectionEnd;
      if (selStart !== selEnd) {
        actions.push([canop.action.stringRemove, [],
          selStart, value.slice(selStart, selEnd)]);
      }
      actions.push([canop.action.stringAdd, [], selStart - data.length, data]);
    } else {
      actions.push([canop.action.set, [], value, this.canopClient.data]);
    }
    this.canopClient.actAtomically(actions);
  },

  // Takes a list of AtomicOperations and a list of PosChanges.
  updateEditor: function canopTextareaUpdateEditor(delta, posChanges) {
    var cursor = this.cursor();
    this.applyDelta(delta);
    this.updateCursor(posChanges, cursor);
  },

  applyDelta: function canopTextareaApplyDelta(delta) {
    for (var i = 0; i < delta.length; i++) {
      var change = delta[i];
      if (change[1] === canop.action.set) {
        this.editor.value = change[2];
      } else if (change[1] === canop.action.stringAdd) {
        this.editor.setRangeText(change[3], change[2], change[2]);
      } else if (change[1] === canop.action.stringRemove) {
        this.editor.setRangeText('', change[2], change[2] + change[3].length);
      }
    }
  },

  cursor: function canopTextareaCursor() {
    return {
      start: this.editor.selectionStart,
      end: this.editor.selectionStart,
      dir: this.editor.selectionDirection
    };
  },

  updateCursor: function canopTextareaUpdateCursor(posChanges, oldCursor) {
    var start = canop.changePosition(oldCursor.start, posChanges, true);
    var end = canop.changePosition(oldCursor.end, posChanges, true);
    this.editor.selectionStart = start;
    this.editor.selectionEnd = end;
    this.editor.selectionDirection = oldCursor.dir;
  },
};


canop.ui = canop.ui || {};
canop.ui.textarea = function(client, editor) {
  return new CanopTextarea(client, editor);
};

}(this));
