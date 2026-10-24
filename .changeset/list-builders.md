---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
"@mark1russell7/vex-mcp": patch
---

List ops that build lists, the first block of design E of the study of recursion. `drop(list, n)` gives the items after the first `n` items (LIST.DROP). `append(list, other)` gives the items of two lists (LIST.APPEND). `without(list, other)` removes the items with a key of `other` (LIST.WITHOUT). `flat(list)` joins the lists that are the values of the items (LIST.FLAT). Each item keeps its key and its value, and LIST.LENIENT applies to each list that an op reads (LIST.BUILD). Thus a search can keep its stack in a list.

A list chain of the builder has `drop(n)`, `append(other)`, `without(other)` and `flat()`, and the body of an axis can give a list chain (BUILD.LIST.BUILD). The type `ListOp` has four more names, so a `switch` over it needs four more cases.

Tier 2 and a module give a reason for the four ops, and tier 1 evaluates the program. The reference interpreter and the random programs of the test kit have the four ops. The catalog of the MCP server lists them.
