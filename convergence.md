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

Every operation is composed of a list of elements called atomic operations of
the following form:

- a *mark* (an element of marks)
- an *offset* from the start of the string
- a *tag* (either "insert" or "delete")
- a *string* (to be inserted or deleted)

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

    Let before be the list of atomic operations oe from string such that:
      oe.mark < o.mark
    Let after be the list of atomic operations oe from string such that:
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

However, we can offer offset transformation without sacrificing convergence and
the algorithm's simplicity. Let's focus on a centralized server / clients
system using the same principles.

Each canop endpoint manages three operations: one for local modifications,
called *local*; one for modifications sent to the server, called *sent*; one for
modifications that the server has reviewed, called *canon*. Atomic operations
that are canon will never be transformed, ensuring consistency. Even in clients,
the order in which those operations should be applied is canon first, then sent,
then local.

In order to maintain the mark order we had previously, we use the following
mark system, a list ordering with number items:

- the *base* is the index in the list of atomic operations in the canon, or, if
  the atomic operation isn't canonized yet, the highest index of canon
  operations registered locally.
- the *machine* is a unique identifier shared by all local operations on each
  client. It is preferably assigned to clients by the server.
- the *nounce* is an ever-incrementing integer which forces each local atomic
  operation to be unique.

Upon receiving sent operations from a client, the server:

1. modifies each of them by each server canon operation with a base higher than
   that of the sent operations,
2. canonizes them, assigning them a unique increasing base,
3. sends the canonized version to all clients (including the one that sent it).

Upon receiving canon operations from a server, the client:

1. modifies each sent operation by each canon operation,
2. modifies each local operation by each canon operation,
3. appends the received canon operations to the registered canon.

All operation modifications must happen between a canon operation, which remains
unmodified, and a non-canon operation.

Here is a simple operational transformation algorithm, whose main purpose is to
keep offsets updated:

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

Regardless of the operational transformation, the convergence of all clients is
ensured by the immutability of canon operations, and their unique ordering
(through their base index). In fact, we need not use a sorting operation,
assuming we rely on TCP, since all canon operations will be received in order.

The above operational transformation is the simplest that can be devised to fix
the problem we pointed out; however, we can make it arbitrarily complex to cover
more specific issues.


---- Copyright Thaddée Tyl.
