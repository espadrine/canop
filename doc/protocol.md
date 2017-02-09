# Canop Protocol

Aims:

- Compact JSON
- Can edit any JSON data
- Allow adding future operations

General form:

```js
[2, path, deltas]
// delta:
[mark, [action, parameters…]]
```

- `path`: a list of keys, either strings (for objects) or numbers (for arrays).
- `deltas`: a list of deltas applied to the object. Contents depend on the
  action.
- `mark`: a list of integers, [base, machine, opid].
- `base`: integer that uniquely indexes canonical operations.
- `machine`: number to identify a machine. The server assigns it to clients.
- `opid`: integer that increments for each operation a machine produces.

Delta for any value:

- `action`: set = 0
- `key`: any JSON value, possibly of a different type.
- `value`: old value, if any.

(Note: `[0]` "set nothing to nothing" is the empty operation.)

Delta for objects:

- `action`: add = 1, remove = 2, move = 3.
- `key`: key (in the object) as a string.
- `value`: value (for move, path of the new location).

Delta for lists:

- `action`: add = 4, remove = 5, move = 6.
- `key`: index (in the list).
- `value`: value (for move, path of the new location).

Delta for strings:

- `action`: add = 7, remove = 8.
- `key`: offset (in the string).
- `value`: string.

Delta for numbers: [10, number] representing an addition,
11 to multiply, 12 for max, 13 for min.

Delta for booleans: [20] to set, 21 to reset, 22 to toggle.

## Handshake

Client: `[0, protocol version]`.

Server: `[1, machine, json, base]`.

## Informational

Signaling: `[3, machine, {name: "somenick", cursor: path}]`.

Recoverable error: `[4, [[code number, "message"], …]]`.

Unrecoverable error: `[5, [[code number, "message"], …]]`. Reinitialize.

Request operations since a given base: `[6, machine, base]`.