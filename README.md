*Transport-agnostic operation-rich intention-preserving client-server
JSON synchronization protocol.*

**Work in progress**. Status: alpha.
Currently only supports string values.

```js
var canop = require('canop');
var server = new canop.Server({
  data: {some: 'data'}
});
var client = new canop.Client({
  send: function(message) {},
});
server.addClient({
  send: function(message) { client.receive(message); },
  onReceive: function(receive) { client.send = receive; },
});

client.get(['some']);  // 'data'
client.add(['some'], 0, 'modified ');  // 'modified data'
client.move([], 'some', ['final']);  // {final: 'modified data'}

// This event has the following keys:
// - changes: Array of [path, action type, parameters…]
// - posChanges: Array of canop.PosChange
var changeListener = function(event) {};
// Changes from other computers.
client.on('change', changeListener);
// Changes from this computer.
client.on('localChange', changeListener);
// An immutable copy of the data at a path. TODO
client.on('update', function(updated) {}, {path: ['some']});
client.on('localUpdate', function(updated) {}, {path: ['some']});
client.removeListener('change', changeListener);

// When all local operations are acknowledged by the server.
client.on('synced', function() {});
// When some local operations are not acknowledged by the server.
client.on('syncing', function() {});
// When we cannot send operations to the server.
client.on('unsyncable', function() {});

// Return a position (eg. the index of a cursor in a string) corresponding to an
// initial position, mapped through a sequence of changes. You can get an
// Array of PosChanges from the 'change' event.
// By default, returns undefined if it cannot give an intention-preserving
// result. If bestGuess is true, returns a guess instead.
canop.changePosition(position, posChanges, bestGuess);

// Create custom operations. TODO
var actionType = client.registerAction(
  canop.type.list | canop.type.string,  // Types this applies to.
  // Put whatever parameters here, modify object.
  function action(object, params) {},
  // Return the reverse operation for a change with this action.
  // It must be so reverse(reverse(change)) == change.
  function reverse(change) {});
client.act(actionType, path, params);
// For instance, this works:
client.act(client.action.set, ['final'], 'the end.');
```

# Pros

- [Operational Transformations][] minimizes the number of UI operations at the
  cost of tremendous implementation complexity that rises exponentially with the
  number of operations it supports.
- [CRDTs][] tend to use a lot of memory, and require tricky garbage collection
  to avoid bloat. Canop does not suffer from memory bloat. Canonical operations
  are immutable, and so, can be substituted for the equivalent string.
  Furthermore, CRDT reads require more computation for complex structures. CRDTs
  are, however, great for peer-to-peer synchronization.
- [Rebase-sync][] requires local changes to be rebased by changes that the
  server has accepted, similar to our design. However, it denies changes that
  are not rebased, causing the potential for long-term divergence if changes
  happen faster than a client-server round-trip, and preventing the "every
  individual key press appears instantly" experience that has become concurrent
  live editing's signature. Canop operations are immediately rebased and
  accepted by the server.

[Operational Transformations]: http://lively-kernel.org/repository/webwerkstatt/projects/Collaboration/paper/Jupiter.pdf
[CRDTs]: http://arxiv.org/pdf/0907.0929.pdf
[Rebase-sync]: http://marijnhaverbeke.nl/blog/collaborative-editing.html

# Limitations

Out of the box, Canop does not support *peer-to-peer* editing. If the
probability of a central server crashing is at odds with your availability
requirements, that is not a worry, as you can easily add a server fallback
mechanism. On the other hand, if the frequency of edits goes beyond what a
single server can handle, the algorithm can be tweaked to be peer-to-peer (at
the expense of intention preservation). A description of that algorithm will be
available in the paper. You may contribute a patch that implements this
algorithm.

*Compound operations* meant to be atomic will usually keep their meaning thanks
to Canop's intention preservation system. However, it is not guaranteed. For
instance, assuming we store the money of two bank accounts in a list. We encode
a transaction between them with two operations, add and remove: `[20, 50]` ① →
`[15, 50]` ② → `[15, 55]`. We encode a swap between then with two operations
that set their values: `[20, 50]` ③ → `[20, 20]` ④ → `[50, 20]`. If those
compound operations happen concurrently, they can converge to the following
sequence: `[20, 50]` ① → `[15, 50]` ③ → `[15, 20]` ② → `[15, 25]` ④ → `[50,
25]`. Semantically, it should converge to `[55, 15]`, which is clearly not the
case; one account did not receive its money, and the other received money that
was not even in the system.

Canop can, in theory, be instructed to send operations that are part of an
atomic compound in bulk, ensuring that no operation will be executed in the
middle. We hope to implement that. Assuming the swap was performed as a move,
that would have been enough for this example. Alternatively, you may add a
custom atomic operation.

# TODO

- JSON-compatible protocol
- Array index rebasing
- Garbage collection of client-side operations
- Autosave of operations to disk
- Atomic compound operations
