---
"@mark1russell7/vex-compiler": patch
---

In a module, a sort in place of 64 items or fewer uses an insertion sort (COMPILE.MODULE.FUSE.SORT). The option `by` of that sort makes no pair for an item. A longer list uses the sort of the engine. The order, the values and the errors do not change.

This change raises PATCH, because it is a backward-compatible feature before 1.0.0. The text of a module changes, but a caller cannot see the change in a result.
