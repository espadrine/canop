// Copyright © 2013 Thaddee Tyl. All rights reserved.
// Code covered by the LGPL license.

var camp = require('camp').start({ port: +process.argv[2] || 1234 });
var canop = require('./canop');

var shared = new canop.Operation();

// coso: Collaborative socket.
var coso = camp.ws('text', function (socket) {
  socket.on('message', function (data) {
    var change;
    try {
      change = canop.Operation.fromList(JSON.parse(data).D);  // delta.
    } catch(e) { console.error(e); return; }
    coso.clients.forEach(function (client) {
      if (client !== socket) { client.send(data); }
    });
    //console.log('change:', JSON.stringify(change));
    shared.apply(change);
    //console.log('shared:', JSON.stringify(shared));
  });
  socket.send(JSON.stringify({ M: '' + shared }));
});
