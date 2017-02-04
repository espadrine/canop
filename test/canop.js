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
