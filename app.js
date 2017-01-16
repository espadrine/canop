// © Thaddee Tyl. LGPL.

var camp = require('camp').start({ port: +process.argv[2] || 1234 });
var canop = require('./canop');

var shared = new canop.Client();
var c = 1;

// coso: Collaborative socket.
var coso = camp.ws('text', function (socket) {
  socket.on('message', function (raw) {
    var data = JSON.parse(raw);
    console.log('< ' + raw);
    var change = canop.Operation.fromProtocol(data);  // delta.
    var canon = shared.receiveSent(change);
    console.log('> ' + JSON.stringify(canon.toProtocol()));
    coso.clients.forEach(function (client) {
      client.send(JSON.stringify(canon.toProtocol()));
    });
  });
  socket.send(JSON.stringify([1, c++, '' + shared, shared.base]));
});

process.on('SIGINT', function() {
  console.log('→ ' + shared);
  process.exit();
});
