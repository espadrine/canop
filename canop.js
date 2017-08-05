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
var actions = {
  pass: 0,
  set: 1,
  stringAdd: 8,
  stringRemove: 9
};
var PROTOCOL_VERSION = 0;
var PROTOCOL_PLEASE = 0;
var PROTOCOL_STATE = 1;
var PROTOCOL_DELTA = 2;
var PROTOCOL_SIGNAL = 3;
var PROTOCOL_WARNING = 4;
var PROTOCOL_ERROR = 5;
var PROTOCOL_SINCE = 6;
var PROTOCOL_DELTA_SINCE = 7;
var PROTOCOL_WARN_UNKNOWN_BASE = 0;
var warnNamesFromCode = [
  "UnknownBaseError",
];

// The last incrementable integer in IEEE754.
var MAX_INT = 0x1fffffffffffff;

var opid = 0;
function AtomicOperation(action, key, value, base, machine) {
  // Unique identifier for this operation. List of numbers.
  this.mark = [+base, +machine, opid++];
  this.action = action;
  this.key = key;
  this.value = value;
  this.original = null;
}
exports.AtomicOperation = AtomicOperation;
AtomicOperation.prototype = {
  dup: function duplicateAtomicOperation() {
    return AtomicOperation.fromObject(this);
  },
  change: function change() {
    if (this.action === actions.stringAdd) {
      return new PosChange(this.key, this.key + this.value.length,
          this.value.length, this.original? this.original.key: null);
    } else if (this.action === actions.stringRemove) {
      return new PosChange(this.key, this.key + this.value.length,
          -this.value.length, this.original? this.original.key: null);
    }
  },
  // Is this operation's type rebaseable (ie, its indices get reshifted)?
  // If it is, then key = index in a list.
  rebaseable: function rebaseable() {
    return this.action === actions.stringAdd ||
      this.action === actions.stringRemove;
  },
  // Get this operation modified by a list of PosChanges.
  getModifiedBy: function getModifiedBy(changes) {
    if (!this.rebaseable()) { return; }

    var oldEnd = this.key + this.value.length;
    this.original = {
      mark: this.mark.slice(),
      action: this.action,
      key: this.key,
      value: this.value,
    };

    var key = changePosition(this.key, changes);
    // If we are adding, the end of the change has no context before the
    // insertion.
    if (this.action === actions.stringAdd) {
      var end = key + this.value.length;
    } else if (this.action === actions.stringRemove) {
      var end = changePosition(oldEnd, changes);
    }
    if (key === undefined || end === undefined) {
      this.action = actions.pass;  // Nulled to avoid adding spaces at the end in toString().
    } else {
      this.key = key;
      var mappedOldEnd = this.key + this.value.length;
      if (end < mappedOldEnd) {
        // The old end is too large.
        this.value = this.value.slice(0, end - key);
      } else if (end > mappedOldEnd) {
        for (var i = 0; i < end - mappedOldEnd; i++) {
          this.value += " ";
        }
      }
    }
  },
  // Return an inverse of this operation, or undefined if it cannot be inversed.
  inverse: function inverse() {
    var op = this.dup();
    if (this.action === actions.stringAdd) {
      op.action = actions.stringRemove;
    } else if (this.action === actions.stringRemove) {
      op.action = actions.stringAdd;
    } else if (this.action === actions.set) {
      var newValue = op.key;
      op.key = op.value;  // Old value
      op.value = newValue;// New value
    }
    return op;
  },
  toProtocol: function toProtocol() {
    return [this.mark, [this.action, this.key, this.value]];
  },
};

//        lowKey    highKey
//           |         |
// unchanged   context   changed by change
// ao: AtomicOperation.
function PosChange(lowKey, highKey, change, originalLowKey, originalHighKey) {
  this.lowKey = lowKey;
  this.highKey = highKey;
  this.change = change;
  this.originalLowKey = originalLowKey || lowKey;
  this.originalHighKey = originalHighKey || highKey;
  this.inverted = false;
}
PosChange.prototype = {
  dup: function dup() {
    return new PosChange(this.lowKey, this.highKey, this.change,
        this.originalLowKey, this.originalHighKey);
  },
  // Change the key. Returns undefined if the key is removed.
  update: function update(key, originalKey) {
    if (this.highKey <= key) {
      return key + this.change;
    } else if (this.lowKey <= key) {
      if (this.change >= 0) {
        if (this.lowKey < key) {
          return key + this.change;
        }
        // If there are two insertions at the same spot, keep original order.
        if (this.originalLowKey < originalKey) {
          return key + this.change;
        } else { return key; }
      } else if (this.lowKey < key) { return;  // Removal of context.
      } else { return key; }
    } else { return key; }
  },
  inverse: function inverse() {
    var change = this.dup();
    change.change = - change.change;
    change.inverted = !change.inverted;
    return change;
  },
  // Is this change a mirror image (ie, an inversion) of our change?
  mirror: function mirror(change) {
    return this.change === -change.change
      && this.originalLowKey === change.originalLowKey
      && this.originalHighKey === change.originalHighKey
      && this.inverted === !change.inverted;
  },
};

// Return a key that was modified by changes, a list of PosChanges.
// Return undefined if it cannot find one, unless bestGuess is true.
// The following must hold:
// changePosition(changePosition(key, changes), changes.map(c => c.inverse())) == key
// or undefined.
var changePosition = function changePosition(key, changes, bestGuess) {
  var originalKey = key;
  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];
    if (change === undefined) {
      if (bestGuess) { return key; }
      else { return; }
    }
    var newKey = change.update(key, originalKey);
    var contextFound = false;
    if (newKey === undefined) {
      // We lost our context. We must try to find it again.
      for (var j = i + 1; j < changes.length; j++) {
        if (change.mirror(changes[j])) {
          i = j;
          contextFound = true;
          break;
        }
      }
      if (!contextFound) {
        if (bestGuess) { return key; }
        else { return; }
      }
    } else { key = newKey; }
  }
  return key;
}

AtomicOperation.fromObject = function (data) {
  var ao = new AtomicOperation(data.action, data.key, data.value, data.mark[0]);
  opid--;  // Compensate opid increment.
  ao.mark = data.mark.slice();
  if (data.original != null) {
    ao.original = {
      mark: data.original.mark.slice(),
      action: data.original.action,
      key: data.original.key,
      value: data.original.value,
    };
  }
  return ao;
};

// delta: [mark, [action, parameters…]]
AtomicOperation.fromProtocol = function (delta) {
  var mark = delta[0];
  var action = delta[1][0];
  var key = delta[1][1];
  var value = delta[1][2];
  var ao = new AtomicOperation(action, key, value, mark[0]);
  opid--;  // Compensate opid increment.
  ao.mark = mark.slice();
  return ao;
};

function Operation(ops) {
  // List of AtomicOperation.
  this.list = ops || [];
}
exports.Operation = Operation;

// data: [2, path, deltas]
Operation.fromProtocol = function (data) {
  var op = new Operation();
  var deltas = data[2];
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
  // Return the inverse Operation, or undefined if it cannot be inversed.
  inverse: function inverse() {
    var invOp = new Operation();
    for (var i = this.list.length - 1; i >= 0; i--) {
      var invAo = this.list[i].inverse();
      if (invAo === undefined) { return; }
      invOp.list.push(invAo);
    }
    return invOp;
  },
  // Return a list of PosChange.
  change: function change() {
    var posChanges = [];
    for (var i = 0; i < this.list.length; i++) {
      var change = this.list[i].change();
      if (change === undefined) { return posChanges; }
      posChanges.push(change);
    }
    return posChanges;
  },
  // Return a list of PosChange.
  inverseChange: function inverseChange() {
    var posChanges = [];
    for (var i = this.list.length - 1; i >= 0; i--) {
      var change = this.list[i].change();
      if (change === undefined) { return posChanges; }
      change = change.inverse();
      if (change === undefined) { return posChanges; }
      posChanges.push(change);
    }
    return posChanges;
  },
  // Insert a value to the operation. Mutates this.
  add: function addOp(path, offset, value, base, local) {
    var aop = new AtomicOperation(actions.stringAdd, offset, value, base, local);
    this.list.push(aop);
    return aop;
  },
  // Delete a value to the operation. Mutates this.
  remove: function removeOp(path, offset, value, base, local) {
    var aop = new AtomicOperation(actions.stringRemove, offset, value, base, local);
    this.list.push(aop);
    return aop;
  },
  // Change the whole value. Mutates this.
  set: function setOp(path, newVal, oldVal, base, local) {
    var aop = new AtomicOperation(actions.set, newVal, oldVal, base, local);
    this.list.push(aop);
    return aop;
  },
  // Assume we start with the empty value.
  toString: function toString() {
    var s = '';
    for (var i = 0; i < this.list.length; i++) {
      var op = this.list[i];
      if (op.action === actions.stringAdd) {
        // padding
        var padding = op.key - s.length;
        for (var j = 0; j < padding; j++) {
          s += ' ';
        }
        s = s.slice(0, op.key) + op.value + s.slice(op.key);
      } else if (op.action === actions.stringRemove) {
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
      } else if (op.action === actions.set) {
        s = op.key;
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
    // TODO: right now we only support root objects ([]).
    return [PROTOCOL_DELTA, [], deltas];
  }
};

// Mark is a list. Return the alphabetically-ordered lesser one:
// -1 if mark1 is smaller than mark2, 1 if it is higher, 0 otherwise.
// FIXME: seems unused.
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

// FIXME: seems unused.
function equalMark(mark1, mark2) {
  if (!mark1 || !mark2) { return false; }
  var len = mark1.length;
  if (len !== mark2.length) { return false; }
  for (var i = 0, len = mark1; i < len; i++) {
    if (mark1[i] !== mark2[i]) { return false; }
  }
  return true;
}

// Client states
var STATE_UNSYNCABLE = 0; // Disconnected.
var STATE_LOADING = 1;    // Connected, but not ready to exchange diffs.
var STATE_READY = 2;      // Ready to exchange diffs.

// params: an object
// - data: content of the root canonical operation.
// - base: integer identifying the root canonical operation.
// - disableData: for clients, do not hold data in this.data.
//   Avoids holding that memory, but breaks get(), toString(),
//   update, localUpdate.
// - send: function(String); for clients, function that will be called to
//   transmit protocol information to the server. It abstracts the method by
//   which data is exchanged.
function Client(params) {
  var self = this;
  params = params || {};
  this.base = params.base || 0;  // Most recent known canon operation index.
  this.localId = 0;              // Identifier of the current machine.
  this.local = new Operation();  // Operation for local changes.
  this.sent = new Operation();   // Operation for changes sent but not acknowledged.
  this.canon = new Operation();  // Operation for changes acknowledged by the server.
  // Map from event names to array of {func: function(event), options}.
  this.listeners = {};

  this.on('change', function(event) { self.updateData(event); });
  this.on('localChange', function(event) { self.updateData(event); });
  // Note: servers should never disable data.
  this.disableData = !!params.disableData;
  this.data = undefined;  // Holds the current data including local operations.
  // Also, clients should never have params.data.
  // FIXME: maybe separate Server and Client into two classes.
  if (params.data !== undefined) {
    this.isServer = true;
    this.base = params.base || 1;
    this.data = params.data;
    this.emit('localChange', {changes: [[[], actions.set, this.data]]});
  } else {
    this.isServer = false;
  }

  this.send = params.send || function() {
    throw 'Default Canop send operation';
  };
  this.clients = {}; // Map from client ids to {send, onReceive}.
  this.nextClientId = 1;
  this.clientCount = 0;  // Number of clients connected.
  this.signalFromClient = Object.create(null);

  this.clientState = STATE_UNSYNCABLE;
  if (!this.isServer) {
    var initiateLoading = function() {
      try {
        if (self.localId === 0) {
          self.send(JSON.stringify([PROTOCOL_PLEASE, PROTOCOL_VERSION]));
        } else {
          self.send(JSON.stringify([PROTOCOL_SINCE, self.localId, self.base]));
        }
        self.clientState = STATE_LOADING;
        self.clientCount++;
      } catch(e) {
        self.emit('unsyncable', e);
      }
    };
    this.on('unsyncable', function() {
      if (self.clientState === STATE_UNSYNCABLE) { return; }
      self.clientState = STATE_UNSYNCABLE;
      self.once('syncing', initiateLoading);
    });
    this.once('syncing', initiateLoading);
    this.on('signal', function(event) {
      if (event.data.connected !== undefined) {
        if (event.data.connected) {
          self.clientCount++;
        } else { self.clientCount--; }
      }
    });
  }
}
exports.Client = Client;
exports.Server = Client;

Client.prototype = {
  // As a client.

  on: function(eventName, listener, options) {
    this.listeners[eventName] = this.listeners[eventName] || [];
    this.listeners[eventName].push({func: listener, options: options});
  },
  once: function(eventName, listener, options) {
    var self = this;
    var listn = function() {
      listener();
      self.removeListener(eventName, listn);
    };
    this.on(eventName, listn, options);
  },
  emit: function(eventName, event) {
    var listeners = this.listeners[eventName];
    if (listeners == null) { return; }
    // We copy listeners to avoid running into a listener removing the next.
    var curListn = listeners.slice();
    var curListnLen = curListn.length;
    for (var i = 0; i < curListnLen; i++) {
      curListn[i].func(event);
    }
  },
  removeListener: function(eventName, listener) {
    var listeners = this.listeners[eventName];
    if (listeners == null) { return; }
    var listenersLen = listeners.length;
    for (var i = 0; i < listenersLen; i++) {
      if (listeners[i].func === listener) {
        listeners.splice(i, 1);
        return;
      }
    }
  },

  // protocol: JSON string
  // Validate protocol data and return it as parsed.
  // May throw errors if it does not follow the protocol.
  readProtocol: function(protocolData) {
    var protocol = protocolData;
    if (typeof protocol === 'string') {
      try {
        protocol = JSON.parse(protocol);
      } catch(e) {
        throw new Error("Invalid Canop message: " + e.message + "\n" +
          "Message: " + protocolData);
      }
    }
    if (!(protocol instanceof Array)) {
      throw new Error("Invalid Canop message: toplevel is not an array.\n" +
        "Message: " + protocolData);
    }
    if (protocol[0] === PROTOCOL_PLEASE) {
    } else if (protocol[0] === PROTOCOL_STATE) {
      if (protocol[1] === undefined) {  // json
        throw new Error("Invalid Canop message: undefined state\nMessage:" +
          protocolData);
      }
      if (typeof protocol[2] !== "number") {  // base
        throw new Error("Invalid Canop message: non-number base\n" +
          "Message: " + protocolData);
      }
      if (typeof protocol[3] !== "number") {  // machine
        throw new Error("Invalid Canop message: non-number " +
          "machine\nMessage: " + protocolData);
      }
    } else if (protocol[0] === PROTOCOL_DELTA ||
               protocol[0] === PROTOCOL_DELTA_SINCE) {
      if (!(protocol[1] instanceof Array)) {
        throw new Error("Invalid Canop message: delta path is not an " +
          "Array.\nMessage: " + protocolData);
      }
      if (!(protocol[2] instanceof Array)) {
        throw new Error("Invalid Canop message: deltas are not an " +
          "Array.\nMessage: " + protocolData);
      }
      for (var i = 0; i < protocol[2].length; i++) {
        var delta = protocol[2][i];
        if (!(delta[0] instanceof Array)) {
          throw new Error("Invalid Canop message: delta " + i +
            " has non-Array mark.\nMessage: " + protocolData);
        }
        for (var j = 0; j < delta[0].length; j++) {
          if (typeof delta[0][j] !== "number") {
            throw new Error("Invalid Canop message: delta " + i +
              " has a non-number in mark at position " + j + ".\n" +
              "Message: " + protocolData);
          }
        }
        if (!(delta[1] instanceof Array)) {
          throw new Error("Invalid Canop message: delta " + i +
            " has non-Array operation.\nMessage: " + protocolData);
        }
        if (delta[1][0] === actions.pass) {  // pass
        } else if (delta[1][0] === actions.set) {  // set
        } else if ((delta[1][0] === actions.stringAdd) ||
                   (delta[1][0] === actions.stringRemove)) {
          // string add / remove
          if (typeof delta[1][1] !== "number") {  // offset
            throw new Error("Invalid Canop message: delta " + i +
              " has non-number string offset.\nMessage: " + protocolData);
          }
          if (typeof delta[1][2] !== "string") {
            throw new Error("Invalid Canop message: delta " + i +
              " has non-string string edition.\nMessage: " + protocolData);
          }
        } else {
          throw new Error("Invalid Canop message: delta " + i +
            " has an unsupported operation type.\n" +
            "Message: " + protocolData);
        }
      }
    } else if (protocol[0] === PROTOCOL_SIGNAL) {
      if (typeof protocol[1] !== "number") {  // machine
        throw new Error("Invalid Canop message: non-number " +
          "machine.\nMessage: " + protocolData);
      }
      if ((protocol[2] !== undefined) && ((typeof protocol[2] !== 'object') ||
        (protocol[2] instanceof Array))) {  // signal
        throw new Error("Invalid Canop message: non-object " +
          "signal.\nMessage: " + protocolData);
      }
    } else if ((protocol[0] === PROTOCOL_WARNING) ||
        (protocol[0] === PROTOCOL_ERROR)) {
      protocol[1].forEach(function(error) {
        if (typeof error[0] !== "number") {  // error code
          throw new Error("Invalid Canop message: non-number " +
            "error code.\nMessage: " + protocolData);
        }
        if (typeof error[1] !== "string") {  // error message
          throw new Error("Invalid Canop message: non-string " +
            "error message.\nMessage: " + protocolData);
        }
      });
    } else if (protocol[0] === PROTOCOL_SINCE) {
      if (typeof protocol[1] !== "number") {  // machine
        throw new Error("Invalid Canop message: non-number " +
          "machine.\nMessage: " + protocolData);
      }
      if (typeof protocol[2] !== "number") {  // base
        throw new Error("Invalid Canop message: non-number " +
          "base.\nMessage: " + protocolData);
      }
    } else {
      throw new Error("Invalid Canop message: unknown message type " +
        protocol[0] + "\nMessage: " + protocolData);
    }
    return protocol;
  },

  // Client-side protocol reception.
  receive: function(message) {
    var self = this;
    try {
      var protocol = this.readProtocol(message);
    } catch(e) {
      console.error(e);
      return;
    }
    var messageType = protocol[0];
    if (messageType === PROTOCOL_STATE) {
      this.reset(protocol[1], protocol[2], protocol[3]);
      this.clientState = STATE_READY;
      this.sendToServer();
    } else if (messageType === PROTOCOL_DELTA_SINCE) {
      this.receiveChange(protocol);
      this.clientState = STATE_READY;
      this.sendToServer();
    } else if (messageType === PROTOCOL_DELTA) {
      if (this.clientState !== STATE_READY) { return; }
      this.receiveChange(protocol);
      this.sendToServer();
    } else if (messageType === PROTOCOL_SIGNAL) {
      if (this.clientState !== STATE_READY) { return; }
      var clientId = protocol[1];
      var data = protocol[2];
      this.signalFromClient[clientId] = this.signalFromClient[clientId] || {};
      if (data !== undefined) {
        for (var key in data) {
          this.signalFromClient[clientId][key] = data[key];
        }
      }
      this.emit('signal', { clientId: clientId, data: data });
    } else if (messageType === PROTOCOL_WARNING) {
      protocol[1].forEach(function(error) {
        if (error[0] === PROTOCOL_WARN_UNKNOWN_BASE) {
          // FIXME: fetch a fully copy, show the user what will happen if their
          // local changes are applied on top of if.
          var error = new Error(error[1]);
          error.name = warnNamesFromCode[error[0]];
          self.emit('unsyncable', error);
        }
      });
    } else if (messageType === PROTOCOL_ERROR) {
      protocol[1].forEach(function(error) { console.error(error); });
    } else {
      console.error("Unknown protocol message " + message);
    }
  },
  // Emit change / localChange events using their proper formats.
  // eventName: either 'change' or 'localChange'.
  // changes: list of AtomicOperation.
  // posChanges: list of PosChange.
  emitChanges: function(eventName, changes, posChanges) {
    var change = changes.map(function(change) {
      return [[], change.action, change.key, change.value];
    });
    this.emit(eventName, {changes: change, posChanges: posChanges});
  },
  // Receive an external update conforming to the protocol, as a String.
  // Emit the corresponding change, update and synced events.
  // This is meant for clients.
  receiveChange: function(update) {
    var path = update[1];
    var deltas = update[2];
    var canon = Operation.fromProtocol(update);

    // Remove atomic operations that are already known.
    // It can happen if we accidentally send two SINCE,
    // therefore receiving two diffs from the same base.
    var base = this.base;
    for (var i = 0; i < canon.list.length; i++) {
      if (base < canon.list[i].mark[0]) {
        break;
      }
    }
    var startIdx = i;  // First index of new canon operations for us.
    canon.list = canon.list.slice(startIdx);

    // Changes to perform locally.
    var changes = this.local.inverse().list
      .concat(this.sent.inverse().list)
      .concat(canon.dup().list);
    var posChanges = this.receiveCanon(canon);
    changes = changes.concat(this.sent.dup().list)
      .concat(this.local.dup().list);
    this.emitChanges('change', changes, posChanges);
    if (this.local.list.length === 0 && this.sent.list.length === 0) {
      this.emit('synced');
    }
    // TODO: emit the update event.
  },

  reset: function(data, base, localId) {
    this.local = new Operation();
    this.sent = new Operation();
    this.canon = new Operation();
    this.localId = localId;
    if (!this.disableData) { this.data = data; }
    this.receiveChange([PROTOCOL_DELTA, [], [[[base, localId, 0], [actions.set, data]]]]);
  },
  localToSent: function() {
    // Switch all local operations to sent.
    this.sent.list = this.sent.list.concat(this.local.list);
    this.local.list = [];
  },
  // Integrate canonical operations and rebase local / sent operations.
  // Takes an Operation.
  // Returns a list of PosChange.
  receiveCanon: function(canon) {
    if (canon.list.length === 0) {
      return [];
    }
    var sent = this.sent.dup();
    // Remove all canon operations from sent.
    for (var i = 0; i < canon.list.length; i++) {
      var canOp = canon.list[i];
      var sentOp = this.sent.list[0];
      if (sentOp !== undefined &&
          sentOp.mark[1] === canOp.mark[1] && sentOp.mark[2] === canOp.mark[2]) {
        this.sent.list.shift();
      }
    }
    // Operations are mapped backwards to the common root,
    // then mapped forward to the tip of the canon.
    // ─┬────→ canon ───→ (sent - canon) ──→ local →
    //  └─── sent ←── local ←
    var posChanges = this.local.inverseChange()
      .concat(sent.inverseChange())
      .concat(canon.change());
    var localCount = this.local.list.length;
    var sentCount = this.sent.list.length;
    for (var i = 0; i < sentCount; i++) {
      var sentOp = this.sent.list[i];
      // Changed by previous sent operations and canon alone.
      var cutOut = localCount + sentCount - i;
      sentOp.getModifiedBy(posChanges.slice(cutOut));
      posChanges.push(sentOp.change());
    }
    for (var i = 0; i < localCount; i++) {
      var localOp = this.local.list[i];
      var cutOut = localCount - i;
      localOp.getModifiedBy(posChanges.slice(cutOut));
      posChanges.push(localOp.change());
    }
    // Rebase local operations.
    this.base = canon.list[canon.list.length - 1].mark[0];
    for (var i = 0; i < this.sent.list.length; i++) {
      this.sent.list[i].mark[0] = this.base;
    }
    for (var i = 0; i < this.local.list.length; i++) {
      this.local.list[i].mark[0] = this.base;
    }
    return posChanges;
  },

  sendToServer: function sendToServer() {
    if (this.clientState === STATE_UNSYNCABLE ||
        this.clientState === STATE_LOADING) { return; }
    if (this.sent.list.length > 0) { return; }
    if (this.local.list.length > 0) {
      this.emit('syncing');
      try {
        //var data = JSON.stringify(this.local.toProtocol());
        //setTimeout(() => this.send(data), 2000)
        this.send(JSON.stringify(this.local.toProtocol()));
        this.localToSent();
      } catch(e) {
        this.emit('unsyncable', e);
      }
    }
  },

  // This is meant to be a callback of the update and localUpdate events.
  updateData: function(event) {
    var changes = event.changes;
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      // TODO: find object at the correct path.
      var path = change[0];
      var target = this.data;
      var actionType = change[1];
      if (actionType === actions.set) {
        target = change[2];
      } else if (actionType === actions.stringAdd) {
        var offset = change[2];
        var value = change[3];
        target = target.slice(0, offset) +
          value + target.slice(offset);
      } else if (actionType === actions.stringRemove) {
        var offset = change[2];
        var value = change[3];
        target = target.slice(0, offset) +
          target.slice(offset + value.length);
      }
      this.data = target;
    }
  },

  get: function(path) {
    if (this.disableData) {
      throw new Error("Canop was configured not to hold data");
    }
    if (this.data === undefined) {
      throw new Error("Canop does not hold any data yet");
    }
    // TODO: find object at the correct path.
    return this.data;
  },
  add: function addOp(path, key, value) {
    // TODO: find object at the correct path.
    this.act([actions.stringAdd, path, key, value]);
    this.sendToServer();
  },
  remove: function removeOp(path, key, value) {
    // TODO: find object at the correct path.
    // TODO: localChange, localUpdate events.
    this.act([actions.stringRemove, path, key, value]);
    this.sendToServer();
  },
  toString: function() {
    return this.get([]).toString();
  },

  // action: [actions.*, path, …params]
  // path: list of keys (string or integer) to the object that receive the
  //   operation.
  act: function(action) {
    var aops = this.commitAction(action);
    // TODO: localUpdate event.
    this.emitChanges('localChange', aops);
    this.sendToServer();
  },
  // actions: list of [actionType, path, …params].
  actAtomically: function(actions) {
    var aops = [];
    for (var i = 0; i < actions.length; i++) {
      aops = aops.concat(this.commitAction(actions[i]));
    }
    this.emitChanges('localChange', aops);
    this.sendToServer();
  },
  // action: [actions.*, path, …params]
  // Return a list of AtomicOperations.
  commitAction: function(action) {
    var actionType = action[0];
    var aops = [];  // AtomicOperations
    if (actionType === actions.pass) {
    } else if (actionType === actions.set) {
      aops.push(this.set(action));
    } else if (actionType === actions.stringAdd) {
      aops.push(this.stringAdd(action));
    } else if (actionType === actions.stringRemove) {
      aops.push(this.stringRemove(action));
    } else {
      throw new Error("Unknown Canop action");
    }
    return aops;
  },
  // action: [actions.stringAdd, path, …params]
  // Return an AtomicOperation.
  stringAdd: function(action) {
    return this.local.add(action[1], action[2], action[3],
      this.base, this.localId);
  },
  // action: [actions.stringAdd, path, …params]
  // Return an AtomicOperation.
  stringRemove: function(action) {
    return this.local.remove(action[1], action[2], action[3],
      this.base, this.localId);
  },
  // action: [actions.set, path, new value, old value]
  // Return an AtomicOperation.
  set: function(action) {
    return this.local.set(action[1], action[2], action[3],
        this.base, this.localId);
  },

  // Send a signal to all other nodes of the network.
  // content: JSON-serializable value, sent to other nodes.
  signal: function(content) {
    if (this.clientState !== STATE_READY) { return; }
    var json = JSON.stringify(content);
    try {
      this.send(JSON.stringify([PROTOCOL_SIGNAL, this.localId, content]));
    } catch(e) {
      this.emit('unsyncable', e);
    }
  },

  // As a server.

  // newClient: an object with the following fields
  // - send: function(message)
  // - onReceive: function(receive: function(message))
  addClient: function(newClient) {
    var self = this;
    newClient.id = self.nextClientId;
    newClient.base = 0;
    self.nextClientId++;
    self.clients[newClient.id] = newClient;
    self.clientCount++;

    newClient.onReceive(function receiveFromClient(message) {
      try {
        var protocol = self.readProtocol(message);
      } catch(e) {
        console.error(e);
        return;
      }
      var messageType = protocol[0];
      if (messageType === PROTOCOL_PLEASE) {
        var protocolVersion = protocol[1];
        if (protocolVersion !== PROTOCOL_VERSION) {
          newClient.send(JSON.stringify([PROTOCOL_ERROR,
            [[0, "Unsupported protocol version"]]]));
        } else {
          newClient.base = self.base;
          newClient.send(JSON.stringify([PROTOCOL_STATE, self.data, self.base,
            newClient.id]));
        }
        self.sendSignalsToClient(newClient);
      } else if (messageType === PROTOCOL_SINCE) {
        var base = protocol[2];
        self.removeClient(newClient);
        var oldClientId = newClient.id;
        newClient.id = protocol[1];
        newClient.base = base;
        self.clients[newClient.id] = newClient;
        var deltas = self.operationsSinceBase(base);
        if (deltas !== undefined) {
          var op = new Operation(deltas);
          var protoDeltas = deltas.map(function(aop) { return aop.toProtocol(); });
          // TODO: right now we only support root objects ([]).
          newClient.send(JSON.stringify([PROTOCOL_DELTA_SINCE, [],
            protoDeltas]));
        } else {
          newClient.send(JSON.stringify([PROTOCOL_WARNING,
            [[PROTOCOL_WARN_UNKNOWN_BASE, "Unknown base"]]]));
        }
        // The client may have had its id changed.
        delete self.signalFromClient[oldClientId];
        self.signalFromClient[newClient.id] = self.signalFromClient[newClient.id] ||
          Object.create(null);
        self.sendSignalsToClient(newClient);
      } else if (messageType === PROTOCOL_DELTA) {
        var change = Operation.fromProtocol(protocol);
        var canon = self.receiveSent(change);
        var message = JSON.stringify(canon.toProtocol());
        for (var clientId in self.clients) {
          var client = self.clients[clientId];
          client.send(message);
        }
      } else if (messageType === PROTOCOL_SIGNAL) {
        var clientId = protocol[1];
        var data = protocol[2];
        if (data !== undefined) {
          for (var key in data) {
            self.signalFromClient[clientId][key] = data[key];
          }
        }
        for (var clientId in self.clients) {
          if (newClient.id !== +clientId) {
            var client = self.clients[clientId];
            client.send(message);
          }
        }
      } else {
        console.error("Unknown protocol message " + message);
      }
    });
    // Send the connection signal.
    this.signalFromClient[newClient.id] = this.signalFromClient[newClient.id] ||
      Object.create(null);
    this.signalFromClient[newClient.id].connected = true;
  },

  // Send aggregated signals from other clients to this client.
  sendSignalsToClient: function(client) {
    for (var clientId in this.clients) {
      if (client.id !== +clientId) {
        client.send(JSON.stringify([PROTOCOL_SIGNAL, +clientId,
          this.signalFromClient[clientId]]));
        var otherClient = this.clients[clientId];
        otherClient.send(JSON.stringify([PROTOCOL_SIGNAL, client.id,
          this.signalFromClient[client.id]]));
      }
    }
  },

  removeClient: function(client) {
    var clientId = client.id;
    delete this.clients[clientId];
    // Send a reset signal to all clients.
    for (var aClientId in this.clients) {
      var aClient = this.clients[aClientId];
      aClient.send(JSON.stringify([PROTOCOL_SIGNAL, +clientId,
        {connected: false}]));
    }
    delete this.signalFromClient[clientId];
    this.clientCount--;
  },

  // Return a list of atomic operations, or undefined.
  operationsSinceBase: function(base) {
    if (base === this.base) { return []; }
    for (var i = this.canon.list.length - 1; i >= 0; i--) {
      if (this.canon.list[i].mark[0] <= base) {
        return this.canon.list.slice(i + 1);
      }
    }
  },

  // Canonize sent operations. Takes an Operation.
  // Returns the canonized operations.
  receiveSent: function(sent) {
    var base = sent.list[0].mark[0];
    var origin = sent.list[0].mark[1];
    var canon = this.operationsSinceBase(base);
    if (canon === undefined) {
      canon = this.canon.list;
    }
    // Remove canon operations from sent.
    // It is necessary in the following situation:
    // 1. Client ──(x)─→ Server
    // 2. Client ──(x y z)─→ Server (x)
    //    (The server has not yet sent back canonized (x) to the client.)
    //
    // ─┬──→ a ─→ x ─→ b  (canon)
    //  └──→ x ─→ y ─→ z  (sent)
    //
    // (This cannot occur if the client waits for a response to send more.)
    var idxSent = 0;  // index through the sent operations.
    var ownSent = [];
    for (var i = 0; i < canon.length; i++) {
      if (canon[i].mark[1] === origin) {
        // Own sent operations arrive in order, so they are canonized in the
        // same order.
        if (canon[i].mark[2] === sent.list[idxSent].mark[2]) {
          // Operation at idxSent was canonized.
          idxSent++;
        } else {
          // Since the client doesn't repeat past sent operations, we must
          // extract them from canon.
          ownSent.push(canon[i]);
        }
      }
    }
    var canonizedSent = sent.list.slice(0, idxSent);
    var nonCanonizedSent = sent.list.slice(idxSent);

    // Extract own sent operations from canon.
    var ownSent = ownSent.map(function(c) {
      var ao = c.dup();
      if (c.original != null) {
        ao.action = c.original.action;
        ao.key = c.original.key;
        ao.value = c.original.value;
      }
      return ao;
    });

    // ─┬──→ a ─→ x ─→ b  (canon)
    //  └─── x ←─ y ←─ z  (sent)
    var posChanges = sent.inverseChange()
      .concat(new Operation(ownSent).inverseChange())
      .concat(new Operation(canon).change());
    // y gets modified by x a x b.
    // z gets modified by y x a x b.
    for (var i = 0; i < nonCanonizedSent.length; i++) {
      var sentOp = nonCanonizedSent[i];
      var cutOut = nonCanonizedSent.length - i;
      sentOp.getModifiedBy(posChanges.slice(cutOut));
      posChanges.push(sentOp.change());
    }
    sent.list = nonCanonizedSent;

    // Set the canon index.
    for (var i = 0; i < sent.list.length; i++) {
      this.base++;
      sent.list[i].mark[0] = this.base;
    }
    this.canon.apply(sent);
    this.emitChanges('change', sent.list, posChanges);
    // Clean up the canon operations that every connected user has.
    this.removeCommonOps();
    return sent;
  },

  removeCommonOps: function() {
    var earliestClientBase = this.base;
    for (var clientId in this.clients) {
      var client = this.clients[clientId];
      var clientIsInitialized = (client.base !== 0);
      var baseIsEarlier = client.base < earliestClientBase;
      if (clientIsInitialized && baseIsEarlier) {
        earliestClientBase = client.base;
      }
    }
    // Index in canon of the earliestClientBase operation.
    var baseIdx = this.canon.list.length - (this.base - earliestClientBase);
    if (baseIdx > 0) {
      this.canon.list = this.canon.list.slice(baseIdx - 1);
    }
  },
};

exports.operationFromProtocol = Operation.fromProtocol;
exports.action = actions;
exports.changePosition = changePosition;
exports.PosChange = PosChange;

return exports;

}));
