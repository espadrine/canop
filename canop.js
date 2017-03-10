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
  set: 0,
  stringAdd: 7,
  stringRemove: 8
};
var PROTOCOL_PLEASE = 0;
var PROTOCOL_STATE = 1;
var PROTOCOL_DELTA = 2;
var PROTOCOL_SIGNAL = 3;

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
  // Get this operation modified by a list of PosChanges.
  getModifiedBy: function getModifiedBy(changes) {
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
      this.key = 0;  // Nulled to avoid adding spaces at the end in toString().
      this.value = "";  // Null operation.
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
    if (this.action === actions.stringAdd) {
      var op = this.dup();
      op.action = actions.stringRemove;
    } else if (this.action === actions.stringRemove) {
      var op = this.dup();
      op.action = actions.stringAdd;
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
      if (change !== undefined) {
        posChanges.push(change);
      } else {
        posChanges = [];
      }
    }
    return posChanges;
  },
  // Return a list of PosChange.
  inverseChange: function inverseChange() {
    var posChanges = [];
    for (var i = this.list.length - 1; i >= 0; i--) {
      var change = this.list[i].change().inverse();
      if (change !== undefined) {
        posChanges.push(change);
      } else {
        return posChanges;
      }
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
  if (params.disableData !== undefined) {
    this.disableData = params.disableData;
  }
  this.data = undefined;  // Holds the current data including local operations.
  // Also, clients should never have params.data.
  // FIXME: maybe separate Server and Client into two classes.
  if (params.data !== undefined) {
    this.isServer = true;
    this.data = params.data;
    this.emit('localChange', {changes: [[[], actions.set, this.data]]});
  } else {
    this.isServer = false;
  }

  this.send = params.send || function() {};
  this.clients = {}; // Map from client ids to {send, onReceive}.
  this.nextClientId = 1;
  this.signalFromClient = Object.create(null);
}
exports.Client = Client;
exports.Server = Client;

Client.prototype = {
  // As a client.

  on: function(eventName, listener, options) {
    this.listeners[eventName] = this.listeners[eventName] || [];
    this.listeners[eventName].push({func: listener, options: options});
  },
  emit: function(eventName, event) {
    var listeners = this.listeners[eventName];
    if (listeners == null) { return; }
    var listenersLen = listeners.length;
    for (var i = 0; i < listenersLen; i++) {
      listeners[i].func(event);
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
      if (protocol[1] !== 0) {  // Only allow version 0.
        throw new Error("Invalid Canop handshake with protocol version " +
          protocol[1] + "\nMessage: " + protocolData);
      }
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
    } else if (protocol[0] === PROTOCOL_DELTA) {
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
        if (delta[1][0] === 0) {  // set
        } else if ((delta[1][0] === 7) || (delta[1][0] === 8)) {
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
    } else {
      throw new Error("Invalid Canop message: unknown message type " +
        protocol[0] + "\nMessage: " + protocolData);
    }
    return protocol;
  },

  // Client-side protocol reception.
  receive: function(message) {
    try {
      var protocol = this.readProtocol(message);
    } catch(e) {
      console.error(e);
      return;
    }
    var messageType = protocol[0];
    if (messageType === PROTOCOL_STATE) {
      this.reset(protocol[1], protocol[2], protocol[3]);
    } else if (messageType === PROTOCOL_DELTA) {
      this.receiveChange(protocol);
    } else if (messageType === PROTOCOL_SIGNAL) {
      var clientId = protocol[1];
      var data = protocol[2];
      this.signalFromClient[clientId] = this.signalFromClient[clientId] || {};
      if (data !== undefined) {
        for (var key in data) {
          this.signalFromClient[clientId][key] = data[key];
        }
      }
      this.emit('signal', { clientId: clientId, data: data });
    } else {
      console.error("Unknown protocol message " + message);
    }
    this.sendToServer();
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
    this.base = base;
    this.receiveChange([PROTOCOL_DELTA, [], [[[base, localId, 0], [actions.set, data]]]]);
  },
  localToSent: function() {
    // Switch all local operations to sent.
    this.sent.list = this.sent.list.concat(this.local.list);
    this.local.list = [];
  },
  // Integrate canonical operations and rebase local / sent operations.
  // Takes an Operation.
  receiveCanon: function(canon) {
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
    // TODO: localChange, localUpdate events.
    var aop = this.local.add(path, key, value, this.base, this.localId);
    this.emitChanges('localChange', [aop]);
    this.sendToServer();
  },
  remove: function removeOp(path, key, value) {
    // TODO: find object at the correct path.
    // TODO: localChange, localUpdate events.
    var aop = this.local.remove(path, key, value, this.base, this.localId);
    this.emitChanges('localChange', [aop]);
    this.sendToServer();
  },
  toString: function() {
    return this.get([]).toString();
  },

  // Send a signal to all other nodes of the network.
  // content: JSON-serializable value, sent to other nodes.
  signal: function(content) {
    var json = JSON.stringify(content);
    this.send(JSON.stringify([PROTOCOL_SIGNAL, this.localId, content]));
  },

  // As a server.

  // newClient: an object with the following fields
  // - send: function(message)
  // - onReceive: function(receive: function(message))
  addClient: function(newClient) {
    var self = this;
    newClient.id = self.nextClientId;
    self.nextClientId++;
    self.clients[newClient.id] = newClient;

    newClient.onReceive(function receiveFromClient(message) {
      try {
        var protocol = self.readProtocol(message);
      } catch(e) {
        console.error(e);
        return;
      }
      var messageType = protocol[0];
      if (messageType === PROTOCOL_DELTA) {
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
        self.signalFromClient[clientId] = self.signalFromClient[clientId] || {};
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

    // Send welcome message to new client.
    newClient.send(JSON.stringify([PROTOCOL_STATE, self.data, self.base, newClient.id]));
    for (var clientId in self.clients) {
      if (self.signalFromClient[clientId] !== undefined) {
        newClient.send(JSON.stringify([PROTOCOL_SIGNAL, +clientId,
          self.signalFromClient[clientId]]));
      }
    }
  },

  removeClient: function(client) {
    var clientId = client.id;
    delete this.clients[clientId];
    // Send a reset signal to all clients.
    for (var aClientId in this.clients) {
      var aClient = this.clients[aClientId];
      aClient.send(JSON.stringify([PROTOCOL_SIGNAL, +clientId]));
    }
    delete this.signalFromClient[clientId];
  },

  // Return a list of atomic operations.
  operationsSinceBase: function(base) {
    for (var i = this.canon.list.length - 1; i >= 0; i--) {
      if (this.canon.list[i].mark[0] <= base) {
        return this.canon.list.slice(i + 1);
      }
    }
    return this.canon.list;
  },

  // Canonize sent operations. Takes an Operation.
  // Returns the canonized operations.
  receiveSent: function(sent) {
    var base = sent.list[0].mark[0];
    var origin = sent.list[0].mark[1];
    var canon = this.operationsSinceBase(base);
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
    return sent;
  },

};

exports.operationFromProtocol = Operation.fromProtocol;
exports.action = actions;
exports.changePosition = changePosition;
exports.PosChange = PosChange;

return exports;

}));
