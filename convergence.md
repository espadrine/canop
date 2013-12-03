# Commutative Operational Transformation

Let's define an *operational group* as a set of operations `Ω = S1×…×SP`,
combined with a binary operation called *application* `+` such that
∀(o1,o2)∈Ω^2, o1+o2 ∈ Ω (this is the *closure* property).

Two operations are *equal* (`o1 = o2`, with `o1 = (p[1,1],…,p[1,P])` and `o2 =
(p[2,1],…,p[2,P])`) if and only if `∀k≤P, p[1,k] = p[2,k]`.

Let's define a *chain* as a list of operations `(o1, …, on)`.  Applying a chain
to another is appending each element of the second list, in order, at the end of
the first list.

Two chains are *equal* if the application `+` over the succession of elements of
each yield equal operations.

Let's define a *state* as an operation.  The only reasonable meaning that is
meant to be understood is that there exists a *zero state*, which the operation
diverges from.

An operational group *converges* if and only if `∀(o1,o2)∈Ω^2, ∃(o1',o2')∈Ω^2
such that o1 + o1' = o2 + o2'`.  The algorithm that gives o1' and o2' given o1
and o2 is called the *transformation*.

If an operational group converges, then `∀ca,cb chains, ∃ca', cb' chains such
that ca + ca' = cb + cb'`.

Proof: Suppose our operational group converges.  Let ca = (oa1,…,oam) and cb =
(ob1,…,obn).  Let oa = Σ[k=1..m] oak, and ob = Σ[k=1..n] obk.  We know there
exists two operations oa' and ob' such that `oa + oa' = ob + ob'`.  So, there
exists two chains ca' = (oa') and cb' = (ob') such that `ca + ca' = cb + cb'`.

If the application is commutative, then the operational group converges, and the
transformation is trivial.

Proof left for the reader. Hint: `o1' = o2` and `o2' = o1`.


# Strings as an example

A trivial zero state for strings is obviously the empty string, although we can
virtually pick any valid string.

Let the *marks* be a set of elements that are totally ordered under some binary
relation `≤`.  For example, a list composed of a timestamp, a user ID, and a
nonce (which is specific to this user ID).

Every operation is composed of:

1. a mark (an element of marks)
2. a list of elements of the following form:
   - an offset from the start of the string
   - a tag (either "insert" or "delete")
   - a string (to be inserted or deleted)

Recreating the string from the list of operations (here named `string`, since
it really is a representation of a string) goes like this:

    Let s be the zero state for strings.
    For each element o of string:
      if o.tag == insert:
        s = s[:o.offset] + o.string + s[o.offset:]
      else:
        s = s[:o.offset] + s[o.offset + o.string.length:]
    Return s.

An operation `o` mutates a string through the following algorithm, "mark
sorting":

    Let before be the list of operations oe from string such that:
      oe.mark < o.mark
    Let after be the list of operations oe from string such that:
      oe.mark > o.mark
    Return before + [o] + after

Since this algorithm is basically a sorting operation along marks, it can be
trivially optimized, especially with sorted lists of operations to be applied.

The application of two operations returns an operation containing the smallest
of the marks, and a list such that every element of the list of bigger mark is
inserted in the list of smaller mark after the last element whose offset is
smaller than the offset of the element.

By the definition of the mark, we can prove that the application is commutative.
Hence, this operational group converges.  In fact, it is also associative, and
each operation has an inverse (or otherwise put, insertion and deletion are both
reversible). As a result, this operational group is an Abelian group.


# Transformation

The algorithm seen above, while ensuring eventual convergence, would not be
fitting for regular simultaneous editing. Indeed, a text "bc" where the
following sequence of operations is applied by two entities A and B:

1. A inserts "d" at the end (offset 2), timestamp 1
2. B inserts "a" at the beginning (offset 0), timestamp 2
3. A, having not received operation #2 yet, inserts "e" at the end (offset 3),
   timestamp 3

… would result in the converged string "abced", not "abcde", as intended by A.

However, we can maintain the concept of "previous operation" for each operation,
creating a causality tree of operations. Considering that this causality is
already enforced locally through the mark (since timestamps are always
increasing, and the nonce is as well), we only need that information on each
*patch* (a list of operations meant to be applied to a string).
Let's implement it as the mark of the operation from which the patch was
created, stored as `prevMark`. (A null `prevMark` would therefore indicate a
complete string.)

TODO

Here is the operational transformation algorithm, whose main purpose is to keep
offsets updated:

    Let older be an operation.
    Let newer be an operation such that older.mark < newer.mark.
    if older.offset < newer.offset:
      if older.tag == insert:
        newer.offset += older.offset
      else:
        newer.offset -= older.offset
    append older to newer.transformers
    sort newer.transformers
    Return newer



# Optimizing

Usually, when a remote editing session starts, the server needs to keep track of
the state of the data then, and the series of operations that happen from then
on. Let S be this state. The remote editing session may perform operation O1,
while another editing session may perform operation O2.  Assume, without loss of
generality, that `O2.mark > O1.mark`.  In the general case, there is no way for
U1 (respectively U2) to directly take O2 (respectively O1) and apply it to the
current state of the editor, even after making it go through some transformation
that doesn't alter the history of the editor. We therefore have to undo all
registered operations up to the last common state, and apply `O1 + O2`. Indeed,
`+` is only defined for two operations, not for a state, not between a state and
an operation.  Although we said that states work like operations, editors are
not designed to abstract that, and altering the history of operations of the
editor does not change what it displays.

We can, however, design a specific algorithm that performs `S + O`, the
application of an operation to an editor state. If it yields exactly the same
result as the application between two operations, then all previous theorems
apply.  Again, we can do without that algorithm, but it may give us better
performance.

However, this algorithm is a TODO ☺!


---- Copyright Thaddée Tyl.
