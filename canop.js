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
function AtomicOperation(offset, tag, string) {
  // Unique identifier for this operation. List of numbers.
  this.mark = [Date.now(), nounce++, Math.random()];
  this.offset = offset;
  this.tag = tag;
  this.string = string;
}
AtomicOperation.prototype = {
  dup: function duplicateAtomicOperation() {
    return AtomicOperation.fromObject(this);
  }
};

AtomicOperation.fromObject = function (data) {
  var ao = new AtomicOperation(data.offset, data.tag, data.string);
  for (var i = 0; i < data.mark.length; i++) {
    ao.mark[i] = data.mark[i];
  }
  return ao;
};

function Operation() {
  // List of AtomicOperation.
  this.list = [];
}

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
    this.list.sort(function (a, b) {
      return (a.mark < b.mark)? -1: 1;
    });
  },
  // Same as apply, without mutating this.
  combine: function combineOperation(op) {
    var thisDup = this.dup();
    var opDup = op.dup();
    thisDup.list = thisDup.list.concat(opDup.list);
    thisDup.list.sort(function (a, b) {
      return (a.mark < b.mark)? -1: 1;
    });
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
  // Insert a string to the operation. Mutates this.
  insert: function insertOp(offset, string) {
    var aop = new AtomicOperation(offset, tag.insert, string);
    this.list.push(aop);
    return this;
  },
  // Delete a string to the operation. Mutates this.
  delete: function deleteOp(offset, string) {
    var aop = new AtomicOperation(offset, tag.delete, string);
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

exports.Operation = Operation;
exports.AtomicOperation = AtomicOperation;
return exports;

}));
