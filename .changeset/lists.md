---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
---

Lists as values. A `let` binds a list, and a list op applies to its name (LIST.VALUE). The axis `list(expr)` has the keys of the items of a list as targets, in the order of the list (AXIS.LIST). `sortBy(list)` sorts the items by their values, `take(list, n)` gives the first items and `nth(list, i)` gives one value. Tier 2 gives a reason for a program with lists, and tier 1 evaluates it. A standalone module keeps each list as an array. The reference interpreter and the random programs of the test kit have lists too.
