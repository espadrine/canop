// © Thaddee Tyl. LGPL.

var camp = require('camp').start({ port: +process.argv[2] || 1234 });
var canop = require('./canop');

var shared = new canop.Client();

// coso: Collaborative socket.
var coso = camp.ws('text', function (socket) {
  socket.on('message', function (raw) {
    var data = JSON.parse(raw);
    var change = canop.Operation.fromList(data.D);  // delta.
    var canon = shared.receiveSent(change);
    coso.clients.forEach(function (client) {
      client.send(JSON.stringify({D:canon.list}));
    });
  });
  socket.send(JSON.stringify({ M: '' + shared, B: shared.base }));
});
