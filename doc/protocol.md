# Canop Protocol

Aims:

- Compact JSON
- Can edit any JSON data
- Allow adding future operations

General form:

```js
[2, path, deltas]
// with delta being one of:
[mark, [type, action]]
[mark, [type, action, key]]
[mark, [type, action, key, value]]
```

- `path`: a list of keys, either strings (for objects) or numbers (for arrays).
- `deltas`: a list of deltas applied to the object. Contents depend on the
  action.
- `mark`: a list of integers, [base, machine, opid].
- `base`: integer that uniquely indexes canonical operations.
- `machine`: number to identify a machine. The server assigns it to clients.
- `opid`: integer that increments for each operation a machine produces.

Delta for any value:

- 63 (selects all types).
- `action`: set = 0
- `key`: any JSON value, possibly of a different type.
- `value`: old value, if any.

(Note: `[0,0]` "set no type to nothing" is the empty operation.)

Delta for strings:

- 4 (ensures that this is a string operation).
- `action`: action, an integer (add = 1, remove = 2).
- `key`: offset (in the string).
- `value`: string.

Delta for lists:

- 2 (ensures that this is a list operation).
- `action`: action, an integer (add = 1, remove = 2, move = 3).
- `key`: index (in the list).
- `value`: value (for move, path of the new location).

Delta for objects:

- 1 (ensures that this is an object operation).
- `action`: action, an integer (add = 1, remove = 2, move = 3).
- `key`: key (in the object) as a string.
- `value`: value (for move, path of the new location).

Delta for numbers: [8 (number), 1, number] representing an addition,
2 to multiply, 3 for max, 4 for min.

Delta for booleans: [16 (boolean), 1] to set, 2 to reset, 3 to toggle.

## Handshake

Client: `[0, protocol version]`.

Server: `[1, machine, json, base]`.

## Informational

Signaling: `[3, machine, {name: "somenick", cursor: path}]`.

Recoverable error: `[4, [[code number, "message"], …]]`.

Unrecoverable error: `[5, [[code number, "message"], …]]`. Reinitialize.

Request operations since a given base: `[6, machine, base]`.
