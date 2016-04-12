(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.canop = factory();
  }
}(this, function () {
var exports = {};

// Tags indicate the nature of an atomic operation.
var tag = {
  set: 0,
  add: 1,
  remove: 2,
  move: 3,
  multiply: 2,
  toggle: 1,
  on: 2,
  off: 3
};

// The last incrementable integer in IEEE754.
var MAX_INT = 0x1fffffffffffff;

var opid = 0;
function AtomicOperation(tag, key, value, base, machine) {
  // Unique identifier for this operation. List of numbers.
  this.mark = [+base, +machine, opid++];
  this.tag = tag;
  this.key = key;
  this.value = value;
}
exports.AtomicOperation = AtomicOperation;
AtomicOperation.prototype = {
  dup: function duplicateAtomicOperation() {
    return AtomicOperation.fromObject(this);
  },
  // Get this operation modified by another atomic operation.
  getModifiedBy: function getModifiedBy(canOp) {
    if (this.tag === tag.add) {
      this.key = modifyOffsetIns(this.key, canOp);
    } else if (this.tag === tag.remove) {
      var offset = modifyOffsetDel(this, canOp);
      this.value = modifyStringDel(this, canOp);
      this.key = offset;
    }
  },
  toProtocol: function() {
    return [this.mark, this.tag, this.key, this.value];
  },
};

// The following modifications are purely aesthetical. They are meant to mimic
// common editor behaviour. They have no impact over synchronization.

function modifyOffsetIns(offset, canOp) {
  //      ⬐ Insertion
  // ---xxxx--- Canonical deletion
  if (canOp.tag === tag.remove &&
      (canOp.key <= offset && offset < (canOp.key + canOp.value.length))) {
    //    ⬐ Insertion
    // ---xxxx--- Canonical deletion
    return canOp.key;
  }
  if (canOp.key < offset) {
    if (canOp.tag === tag.add) {
      offset += canOp.value.length;
    } else {
      offset -= canOp.value.length;
    }
  }
  return offset;
}

function modifyOffsetDel(thisOp, canOp) {
  var offset = thisOp.key;
  //      xxx Deletion
  // ---xxxx--- Canonical deletion
  if (canOp.tag === tag.remove &&
      (canOp.key <= offset && offset < (canOp.key + canOp.value.length))) {
    //        x Deletion
    // ---xxxx--- Canonical deletion
    return canOp.key;
  }
  if (canOp.key < offset) {
    if (canOp.tag === tag.add) {
      offset += canOp.value.length;
    } else {
      offset -= canOp.value.length;
    }
  }
  return offset;
}

function modifyStringDel(thisOp, canOp) {
  var offset = thisOp.key;
  //      ⬐ Canonical insertion
  // ---xxxx---
  if (canOp.tag === tag.add &&
      (offset <= canOp.key && canOp.key < (offset + thisOp.value.length))) {
    //      ⬐ Canonical insertion
    // ---xx---
    return thisOp.value.slice(0, canOp.key - (offset + thisOp.value.length));
  }
  //      xxx Deletion
  // ---xxxx--- Canonical deletion
  if (canOp.tag === tag.remove &&
      (canOp.key <= offset && offset < (canOp.key + canOp.value.length))) {
    //        x Deletion
    // ---xxxx--- Canonical deletion
    return thisOp.value.slice(canOp.key + canOp.value.length - offset);
  }
  //      xxx Canonical deletion
  // ---xxxx--- Deletion
  if (canOp.tag === tag.remove &&
      (offset <= canOp.key && canOp.key < (offset + thisOp.value.length))) {
    //      xxx Canonical deletion
    // ---xx-----  Deletion
    return thisOp.value.slice(0, canOp.key - offset);
  }
  return thisOp.value;
}

AtomicOperation.fromObject = function (data) {
  var ao = new AtomicOperation(data.tag, data.key, data.value, data.mark[0]);
  opid--;  // Compensate opid increment.
  for (var i = 0; i < data.mark.length; i++) {
    ao.mark[i] = data.mark[i];
  }
  return ao;
};

AtomicOperation.fromProtocol = function (delta) {
  var mark = delta[0];
  var tag = delta[1];
  var key = delta[2];
  var value = delta[3];
  var ao = new AtomicOperation(tag, key, value, mark[0]);
  opid--;  // Compensate opid increment.
  for (var i = 0; i < mark.length; i++) {
    ao.mark[i] = mark[i];
  }
  return ao;
};

function Operation() {
  // List of AtomicOperation.
  this.list = [];
}
exports.Operation = Operation;

Operation.fromProtocol = function (data) {
  // data: [path, deltas, machine]
  var op = new Operation();
  var deltas = data[1];
  for (var i = 0; i < deltas.length; i++) {
    op.list.push(AtomicOperation.fromProtocol(deltas[i]));
  }
  return op;
};

Operation.prototype = {
  // Apply an operation to this one. Return the result.
  // This should be commutative, such that a.apply(b) === b.apply(a).
  apply: function applyOperation(op) {
    var opDup = op.dup();
    this.list = this.list.concat(opDup.list);
  },
  // Same as apply, without mutating this.
  combine: function combineOperation(op) {
    var thisDup = this.dup();
    var opDup = op.dup();
    thisDup.list = thisDup.list.concat(opDup.list);
    return thisDup;
  },
  dup: function duplicate() {
    var newop = new Operation();
    newop.list = new Array(this.list.length);
    for (var i = 0; i < this.list.length; i++) {
      newop.list[i] = this.list[i].dup();
    }
    return newop;
  },
  // Get this operation updated as if op happened before.
  getModifiedBy: function getModifiedBy(op) {
    for (var i = 0; i < this.list.length; i++) {
      this.list[i].getModifiedBy(op);
    }
  },
  // Insert a value to the operation. Mutates this.
  insert: function insertOp(offset, value, base, local) {
    var aop = new AtomicOperation(tag.add, offset, value, base, local);
    this.list.push(aop);
    return this;
  },
  // Delete a value to the operation. Mutates this.
  delete: function deleteOp(offset, value, base, local) {
    var aop = new AtomicOperation(tag.remove, offset, value, base, local);
    this.list.push(aop);
    return this;
  },
  // Assume we start with the empty value.
  toString: function toString() {
    var s = '';
    for (var i = 0; i < this.list.length; i++) {
      var op = this.list[i];
      if (op.tag === tag.add) {
        // padding
        var padding = op.key - s.length;
        for (var j = 0; j < padding; j++) {
          s += ' ';
        }
        s = s.slice(0, op.key) + op.value + s.slice(op.key);
      } else if (op.tag === tag.remove) {
        if (s.slice(op.key, op.key + op.value.length)
            !== op.value) {
          // The intention was not preserved. It's ok, just sad.
          //console.error('deletion error:',
          //    s.slice(op.key,
          //            op.key + op.value.length),
          //    'should be equal to',
          //    op.value);
        }
        s = s.slice(0, op.key) +
          s.slice(op.key + op.value.length);
      }
    }
    return s;
  },
  toProtocol: function() {
    var deltas = [];
    for (var i = 0; i < this.list.length; i++) {
      var op = this.list[i];
      deltas.push(op.toProtocol());
    }
    return [[], deltas];
  }
};

// Mark is a list. Return the alphabetically-ordered lesser one:
// -1 if mark1 is smaller than mark2, 1 if it is higher, 0 otherwise.
function lessThanMark(mark1, mark2) {
  for (var i = 0; i < Math.min(mark1.length, mark2.length); i++) {
    if (mark1[i] < mark2[i]) {
      return -1;
    } else if (mark1[i] > mark2[i]) {
      return 1;
    } // else go on.
  }
  // We have gone through all of them, they are all equal.
  if (mark1.length < mark2.length) { return -1;
  } else if (mark1.length > mark2.length) { return 1;
  } else { return 0; }
}

function Client(base) {
  this.base = base || 0;  // canon index; 0 means no root.
  this.local = new Operation();
  this.sent = new Operation();
  this.canon = new Operation();
  // Default machine id; overriden by receiving one from the server.
  // Collision probability: below 0.5 for n < 111743588.
  // function(n, max) { return 1 - fact(max) / (Math.pow(max, n) * fact(max - n)); }
  // Tailor expansion
  // function(n, max) { return 1 - Math.exp(-n*(n-1)/(max*2)); }
  this.localId = Math.floor(Math.random() * MAX_INT);
  this.listeners = [];  // Array of {listener: function(Operation), options}.
}
exports.Client = Client;
Client.prototype = {
  // Listen to incoming updates (provided by receiveUpdate()).
  // listener: function(Operation), options: {path: [], type: String / null}.
  onUpdate: function(listener, options) {
    this.listeners.push({listener: listener, options: options});
  },
  // Receive an update conforming to the protocol, as a String.
  receiveUpdate: function(updateString) {
    // FIXME: validate that the update conforms to the protocol.
    var update = JSON.parse(updateString);
    var path = update[0];
    var deltas = update[1];
    var machine = update[2];
    if (machine !== undefined) { this.localId = machine; }
    var op = Operation.fromProtocol(update);
    var prevLocal = this.local.dup();
    var prevSent = this.sent.dup();
    this.receiveCanon(op);

    // Go through listeners.
    var listnlen = this.listeners.length;
    for (var i = 0; i < listnlen; i++) {
      var obj = this.listeners[i];
      var listener = obj.listener;
      var options = obj.options;
      var impactedPath = (options.path === undefined) ||
        this.impactedPath(options.path, path);
      var validType = (options.type === undefined) ||
        (options.type === this.pathType(path));
      if (impactedPath && validType) {
        listener(op, prevLocal, prevSent);
      }
    }
  },
  // Is path impacted by a change on diffPath?
  impactedPath: function(path, diffPath) {
    return true;
  },
  pathType: function(path) {
    return String;
  },

  reset: function(value, base) {
    this.local = new Operation();
    this.sent = new Operation();
    this.canon = new Operation();
    this.canon.insert(0, value);
    this.canon.list[0].mark[0] = base;
    this.base = base;
  },
  localToSent: function() {
    // Switch all local operations to sent.
    this.sent.list = this.sent.list.concat(this.local.list);
    this.local.list = [];
  },
  // Return a list of atomic operations.
  operationsSinceBase: function(base) {
    for (var i = this.canon.list.length - 1; i >= 0; i--) {
      if (this.canon.list[i].mark[0] === base) {
        return this.canon.list.slice(i + 1);
      }
    }
    return this.canon.list;
  },
  // Modify your local / sent operations accordingly.
  // Takes an Operation.
  receiveCanon: function(canon) {
    this.canon.apply(canon);
    for (var i = 0; i < canon.list.length; i++) {
      var op = canon.list[i];
      // Remove all canon operations from sent.
      for (var j = 0; j < this.sent.list.length; j++) {
        var sentOp = this.sent.list[j];
        if (sentOp.mark[1] === op.mark[1] && sentOp.mark[2] === op.mark[2]) {
          this.sent.list.splice(j, 1);
        }
      }
      if (op.mark[1] !== this.localId) {
        this.sent.getModifiedBy(op);
        this.local.getModifiedBy(op);
      }
    }
    // Rebase local operations.
    this.base = this.canon.list[this.canon.list.length - 1].mark[0];
    for (var i = 0; i < this.sent.list.length; i++) {
      this.sent.list[i].mark[0] = this.base;
    }
    for (var i = 0; i < this.local.list.length; i++) {
      this.local.list[i].mark[0] = this.base;
    }
  },
  // Canonize sent operations. Takes an Operation.
  // Returns the canonized operations.
  receiveSent: function(sent) {
    var base = sent.list[0].mark[0];
    var origin = sent.list[0].mark[1];
    var delta = this.operationsSinceBase(base);
    for (var i = 0; i < delta.length; i++) {
      var op = delta[i];
      // Don't modify operations from the same origin.
      if (op.mark[1] !== origin) {
        sent.getModifiedBy(op);
      }
    }
    // Set the canon index.
    for (var i = 0; i < sent.list.length; i++) {
      sent.list[i].mark[0] = this.base++;
    }
    this.canon = this.canon.combine(sent);
    return sent;
  },
  insert: function insertOp(offset, value) {
    this.local.insert(offset, value, this.base, this.localId);
  },
  delete: function deleteOp(offset, value) {
    this.local.delete(offset, value, this.base, this.localId);
  },
  toString: function() {
    var total = this.canon.combine(this.sent).combine(this.local);
    return total.toString();
  }
};

exports.operationFromProtocol = Operation.fromProtocol;
exports.TAG = tag;
exports.modifyOffset = modifyOffsetIns;

return exports;

}));
