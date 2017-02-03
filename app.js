// © Thaddee Tyl. LGPL.

var camp = require('camp').start({ port: +process.argv[2] || 1234 });
var canop = require('./canop');

var shared = new canop.Server({ data: '' });
var c = 1;

camp.ws('text', function(socket) {
  var client = {
    send: function(msg) {
      console.log(client.id + '> ' + msg);
      socket.send(msg);
    },
    onReceive: function(receive) {
      socket.on('message', function(msg) {
        console.log('<< ' + msg);
        receive(msg);
      });
    },
  };
  shared.addClient(client);
  socket.on('close', function() { shared.removeClient(client); });
});

process.on('SIGINT', function() {
  console.log('→ ' + shared);
  process.exit();
});
