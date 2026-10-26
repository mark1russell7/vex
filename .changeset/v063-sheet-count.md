---
"@mark1russell7/vex-compiler": patch
---

A module of a sheet from `emitSheetModule` gives `VEX_ERROR` for a cell on a cycle when a count reads the cells of the cycle (V-063). Before, a count of all the items, whose body cannot fail, was the count of the records. The module read no cell of its body. Thus a cell that read itself in such a body gave a number, not the result of `SheetRun`.

The level is PATCH: a fix of a wrong result, and no type changes.
