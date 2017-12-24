var canop = require('../canop.js');
var assert = require('assert');

// A server linked to n clients, initialized with data.
function Star(data, n) {
  data = data || '';
  n = n || 2;
  this.server = new canop.Server({ data: data });
  this.clients = [];
  this.nodes = [];
  for (var i = 0; i < n; i++) {
    let client = new canop.Client({});
    let node = {
      client: client,
      messages: [],
      flush: function() {
        node.messages.forEach(function(message) {
          client.receive(message);
        });
        node.messages = [];
      },
    };
    this.clients.push(client);
    this.nodes.push(node);
    this.server.addClient({
      send: function(message) { node.messages.push(message); },
      onReceive: function(receive) { client.send = receive; },
    });
    client.emit('syncing');
    sendChange(this, i);
  }
}

function sendChange(star, index) {
  star.nodes[index].flush();
}

var star = new Star('bc');
star.clients[0].add([], 2, 'd');
star.clients[1].add([], 0, 'a');
star.clients[0].add([], 3, 'e');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'abcde', 'Concurrent addition');

var star = new Star('bc');
star.clients[0].add([], 2, 'd');
star.clients[1].add([], 0, 'a');
star.clients[0].add([], 3, 'e');
sendChange(star, 1);
sendChange(star, 0);
var result = '' + star.server;
assert.equal(result, 'abcde', 'Reverse concurrent addition');

var star = new Star('bcz');
star.clients[0].remove([], 2, 'z');
star.clients[1].add([], 0, 'a');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'abc', 'Delete right, then add left');

var star = new Star('zab');
star.clients[0].remove([], 0, 'z');
star.clients[1].add([], 3, 'c');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'abc', 'Delete left, then add right');

var star = new Star('xaby');
star.clients[0].remove([], 0, 'x');
star.clients[1].remove([], 3, 'y');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'ab', 'Concurrent deletion');

var star = new Star('abxyze');
star.clients[0].remove([], 2, 'xyz');
star.clients[1].add([], 4, 'cd');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'abe', 'Deletion, then addition in the deletion');

var star = new Star('abxye');
star.clients[0].add([], 4, 'cd');
star.clients[1].remove([], 2, 'xye');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'ab', 'Insertion, then deletion over the addition');

var star = new Star('abxyzc');
star.clients[0].remove([], 2, 'xy');
star.clients[1].remove([], 3, 'yz');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'abzc', 'Deletion, then deletion starting in the deletion');

var star = new Star('abxyzc');
star.clients[0].remove([], 3, 'yz');
star.clients[1].remove([], 2, 'xy');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'abxc', 'Deletion, then deletion wherein the other deletion starts');

var star = new Star('abxyzc');
star.clients[0].remove([], 1, 'bxyz');
star.clients[1].remove([], 2, 'xy');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.server;
assert.equal(result, 'ac', 'Deletion, then deletion embedded in it');

var star = new Star('');
star.clients[0].add([], 0, 'a');
star.clients[0].add([], 1, 's');
star.clients[0].remove([], 1, 's');
sendChange(star, 0);
var result = '' + star.server;
assert.equal(result, 'a', 'Inserting a character immediately removed');

// id
var star = new Star('');
assert.equal(star.clients[0].id, 1, 'Client 0 id');
assert.equal(star.clients[1].id, 2, 'Client 1 id');

// clientCount
var star = new Star('');
sendChange(star, 0);
assert.equal(star.server.clientCount, 2, 'Server clientCount');
assert.equal(star.clients[0].clientCount, 2, 'Client 0 clientCount');
assert.equal(star.clients[1].clientCount, 2, 'Client 1 clientCount');
star.server.removeClient(star.clients[0]);
sendChange(star, 1);
assert.equal(star.server.clientCount, 1, 'Server clientCount after disconnection');
assert.equal(star.clients[1].clientCount, 1, 'Client 1 clientCount after disconnection');

// Undo
var star = new Star('');
star.clients[0].add([], 0, 'ab');
sendChange(star, 0);
star.clients[0].add([], 2, 'cd');
sendChange(star, 0);
sendChange(star, 1);
// Undo wrong client
star.clients[1].undo();
sendChange(star, 0);
sendChange(star, 1);
assert.equal(String(star.clients[0]), 'abcd', 'Client 0 wrong undo');
assert.equal(String(star.clients[1]), 'abcd', 'Client 1 wrong undo');
assert.equal(String(star.server), 'abcd', 'Client 1 wrong undo');
// Undo right client
star.clients[0].undo();
assert.equal(String(star.clients[0]), 'ab', 'Client 0 undo');
sendChange(star, 0);
sendChange(star, 1);
assert.equal(String(star.server), 'ab', 'Server undo');
assert.equal(String(star.clients[1]), 'ab', 'Client 1 undo');
// Redo
star.clients[0].redo();
assert.equal(String(star.clients[0]), 'abcd', 'Client 0 redo');
sendChange(star, 0);
sendChange(star, 1);
assert.equal(String(star.server), 'abcd', 'Server redo');
assert.equal(String(star.clients[1]), 'abcd', 'Client 1 redo');

// Partial undo, edition, and redo
var star = new Star('');
star.clients[0].add([], 0, 'a');
star.clients[0].add([], 1, 'b');
star.clients[0].undo();
star.clients[0].add([], 1, 'c');
star.clients[0].redo();
sendChange(star, 0);
sendChange(star, 1);
assert.equal(String(star.server), 'ac', 'Server undo, edition, redo');
assert.equal(String(star.clients[0]), 'ac', 'Client 0 undo, edition, redo');
assert.equal(String(star.clients[1]), 'ac', 'Client 1 undo, edition, redo');
