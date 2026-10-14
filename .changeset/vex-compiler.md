---
"@mark1russell7/vex-compiler": minor
"@mark1russell7/vex": minor
---

The new package `@mark1russell7/vex-compiler` turns a program into JavaScript source. `tiered(expr, options)` gives a program with the interface of `compile`, and its results are the results of the interpreter (COMPILE.TIERED, property P17). The source has the fast path of each op site for the domains of the options. On the programs of the speed lane, the generated code is 1.0 to 1.13 times the hand-written loops, and 70 to 110 times faster than `compile`. Where it cannot give a result, `compile` gives it (COMPILE.FALLBACK). A program keeps the value of each node that depends only on the space, for example the total of a column, so a run at each key of a space costs O(n) (COMPILE.MEMO).

The core exports `isFieldName`, `safeIs` and `matchesKind` for the compiler. Each space of the core has `records`, the records in the order of the keys (SPACE.RECORDS).
