(function(exports, undefined) {

var canop = exports.canop;
var INITIAL_RECONNECTION_INTERVAL = 256; // ms. Increases exponentially to 10min

// client: a canop.Client instance.
// options:
// - url: string URL for the socket endpoint.
// - reconnect: if true (default), automatically reconnect when disconnected.
// - open: function run when the socket opens.
// - close: function run when the socket closes.
//   (You can also rely on .canopClient.on('unsyncable', …)
// - error: function run when the socket experiences an error.
var CanopWebsocket = function(client, options) {
  options = options || {};
  options.url = options.url ||
    // Trick: use the end of either http: or https:.
    'ws' + window.location.protocol.slice(4) + '//' +
    window.location.host + '/websocket';

  var self = this;
  this.canopClient = client;
  this.canopClient.send = function(msg) {
    if (self.socket === undefined ||
        self.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open for business");
    }
    self.socket.send(msg);
  };
  this.url = "" + options.url;
  this.socket = null;
  this.reconnect = (options.reconnect === undefined)? true: !!options.reconnect;
  this.reconnectionInterval = INITIAL_RECONNECTION_INTERVAL;
  this.receive = this.receive.bind(this);
  this.connect(options);
};

CanopWebsocket.prototype = {
  connect: function canopWebsocketConnect(options) {
    var self = this;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', this.receive);
    this.socket.addEventListener('close', function(e) {
      self.canopClient.emit('unsyncable');
      if (self.reconnect) {
        setTimeout(function() { self.connect(options); },
          self.reconnectionInterval);
        if (self.reconnectionInterval <= 1000 * 60 * 10) {
          self.reconnectionInterval *= 2;
        }
      }
    });
    this.socket.addEventListener('open', function() {
      self.reconnectionInterval = INITIAL_RECONNECTION_INTERVAL;
      self.canopClient.emit('syncing');
    });
    if (options.error) { this.socket.addEventListener('error', options.error); }
    if (options.open) { this.socket.addEventListener('open', options.open); }
    if (options.close) { this.socket.addEventListener('close', options.close); }
  },

  receive: function canopWebsocketReceive(event) {
    this.canopClient.receive('' + event.data);
  },
};

canop.wire = canop.wire || {};
canop.wire.websocket = function(client, options) {
  return new CanopWebsocket(client, options);
};

}(this));
