# Canop Protocol

Aims:

- Compact JSON
- Can edit any JSON data
- Allow adding future operations

General form:

```js
[path, deltas, optional machine]
// with delta being one of:
[mark, tag]
[mark, tag, key]
[mark, tag, key, value]
```

- `path`: a list of keys, either strings (for objects) or numbers (for arrays).
- `deltas`: a list of deltas applied to the object. Contents depend on the tag.
- `mark`: a list of integers, [base, machine, opid].
- `base`: integer that uniquely indexes canonical operations.
- `machine`: number to identify a machine. The server assigns it to clients.
- `opid`: integer that increments for each operation a machine produces.

Delta for any value:

- `tag`: set = 0
- `key`: any JSON value, possibly of a different type.

Delta for strings:

- `tag`: tag, an integer (add = 1, remove = 2).
- `key`: offset (in the string).
- `value`: string.

Delta for lists:

- `tag`: tag, an integer (add = 1, remove = 2, move = 3).
- `key`: index (in the list).
- `value`: value (for move, path of the new location).

Delta for objects:

- `tag`: tag, an integer (add = 1, remove = 2, move = 3).
- `key`: key (in the object) as a string.
- `value`: value (for move, path of the new location).

Delta for numbers: [1, number] representing an addition, 2 to multiply, 3 for
max, 4 for min.

Delta for booleans: [1] to toggle, [2] to set, [3] to reset.

## Informational

When the mark is a 1-item list.

Request operations since a given base: `[[machine], 0, base]`.

Machine name: `[[machine], 1, name]` (with `name` a String).

Cursor position: `[[machine], 2, optional index]`. If no index, disconnection.
