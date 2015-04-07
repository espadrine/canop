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
  insert: 0,
  delete: 1
};

var nounce = 0;
function AtomicOperation(offset, tag, string, base, localId) {
  // Unique identifier for this operation. List of numbers.
  this.mark = [+base, +localId, nounce++];
  this.offset = offset;
  this.tag = tag;
  this.string = string;
}
exports.AtomicOperation = AtomicOperation;
AtomicOperation.prototype = {
  dup: function duplicateAtomicOperation() {
    return AtomicOperation.fromObject(this);
  },
  // Get this operation modified by another atomic operation.
  getModifiedBy: function getModifiedBy(op) {
    this.offset = modifyOffset(this.offset, op);
  },
};

function modifyOffset(offset, op) {
  if (op.offset < offset) {
    if (op.tag === tag.insert) {
      offset += op.string.length;
    } else {
      offset -= op.string.length;
    }
  }
  return offset;
}

AtomicOperation.fromObject = function (data) {
  var ao = new AtomicOperation(data.offset, data.tag, data.string, data.mark[0]);
  nounce--;  // Compensate nounce increment.
  for (var i = 0; i < data.mark.length; i++) {
    ao.mark[i] = data.mark[i];
  }
  return ao;
};

function Operation() {
  // List of AtomicOperation.
  this.list = [];
}
exports.Operation = Operation;

Operation.fromList = function (data) {
  var op = new Operation();
  for (var i = 0; i < data.length; i++) {
    op.list.push(AtomicOperation.fromObject(data[i]));
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
  // Insert a string to the operation. Mutates this.
  insert: function insertOp(offset, string, base, local) {
    var aop = new AtomicOperation(offset, tag.insert, string, base, local);
    this.list.push(aop);
    return this;
  },
  // Delete a string to the operation. Mutates this.
  delete: function deleteOp(offset, string, base, local) {
    var aop = new AtomicOperation(offset, tag.delete, string, base, local);
    this.list.push(aop);
    return this;
  },
  // Assume we start with the empty string.
  toString: function toString() {
    var s = '';
    for (var i = 0; i < this.list.length; i++) {
      var op = this.list[i];
      if (op.tag === tag.insert) {
        // padding
        var padding = op.offset - s.length;
        for (var j = 0; j < padding; j++) {
          s += ' ';
        }
        s = s.slice(0, op.offset) + op.string + s.slice(op.offset);
      } else if (op.tag === tag.delete) {
        if (s.slice(op.offset, op.offset + op.string.length)
            !== op.string) {
          // The intention was not preserved. It's ok, just sad.
          //console.error('deletion error:',
          //    s.slice(op.offset,
          //            op.offset + op.string.length),
          //    'should be equal to',
          //    op.string);
        }
        s = s.slice(0, op.offset) +
          s.slice(op.offset + op.string.length);
      }
    }
    return s;
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
  // FIXME: require the server to tell us who we are.
  // Collision probability: below 0.5 for n < 54563.
  // function(n, max) { return 1 - fact(max) / (Math.pow(max, n) * fact(max - n)); }
  // Tailor expansion
  // function(n, max) { return 1 - Math.exp(-n*(n-1)/(max*2)); }
  this.localId = (Math.random() * 2147483648)|0;
}
exports.Client = Client;
Client.prototype = {
  reset: function(string, base) {
    this.local = new Operation();
    this.sent = new Operation();
    this.canon = new Operation();
    this.canon.insert(0, string);
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
    this.base = this.canon.list[this.canon.list.length - 1].mark[0];
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
  insert: function insertOp(offset, string) {
    this.local.insert(offset, string, this.base, this.localId);
  },
  delete: function deleteOp(offset, string) {
    this.local.delete(offset, string, this.base, this.localId);
  },
  toString: function() {
    var total = this.canon.combine(this.sent).combine(this.local);
    return total.toString();
  }
};

exports.operationFromList = Operation.fromList;
exports.TAG = tag;
exports.modifyOffset = modifyOffset;

return exports;

}));
