var canop = require('../canop.js');
var assert = require('assert');

// A canon server linked to n clients, initialized with text.
function Star(text, n) {
  text = text || '';
  n = n || 2;
  this.canon = new canop.Client();
  this.clients = [];
  for (var i = 0; i < n; i++) {
    this.clients.push(new canop.Client());
  }
  this.clients[0].insert(0, text);
  sendChange(this, 0);
}

function sendChange(star, index) {
  var client = star.clients[index];
  var change = client.local.dup();
  client.localToSent();
  if (change.list.length <= 0) { return; }
  var canon = star.canon.receiveSent(change).dup();
  star.clients.forEach(function(client) {
    client.receiveCanon(canon);
  });
}

var star = new Star('bc');
star.clients[0].insert(2, 'd');
star.clients[1].insert(0, 'a');
star.clients[0].insert(3, 'e');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.canon;
assert.equal(result, 'abcde', 'Concurrent insertion');

var star = new Star('bc');
star.clients[0].insert(2, 'd');
star.clients[1].insert(0, 'a');
star.clients[0].insert(3, 'e');
sendChange(star, 1);
sendChange(star, 0);
var result = '' + star.canon;
assert.equal(result, 'abcde', 'Reverse concurrent insertion');

var star = new Star('bcz');
star.clients[0].delete(2, 'z');
star.clients[1].insert(0, 'a');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.canon;
assert.equal(result, 'abc', 'Delete right, then insert left');

var star = new Star('zab');
star.clients[0].delete(0, 'z');
star.clients[1].insert(3, 'c');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.canon;
assert.equal(result, 'abc', 'Delete left, then insert right');

var star = new Star('xaby');
star.clients[0].delete(0, 'x');
star.clients[1].delete(3, 'y');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.canon;
assert.equal(result, 'ab', 'Concurrent deletion.');

var star = new Star('abxyze');
star.clients[0].delete(2, 'xyz');
star.clients[1].insert(4, 'cd');
sendChange(star, 0);
sendChange(star, 1);
var result = '' + star.canon;
assert.equal(result, 'abcde', 'Deletion, then insertion in the deletion.');
