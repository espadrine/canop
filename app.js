// © Thaddee Tyl. LGPL.

var camp = require('camp').start({ port: +process.argv[2] || 1234 });
var canop = require('./canop');

var shared = new canop.Client();

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
  socket.send(JSON.stringify([[], [[[shared.base, 0, 0], 0, '' + shared]]]));
  //socket.send(JSON.stringify({ M: '' + shared, B: shared.base }));
});
