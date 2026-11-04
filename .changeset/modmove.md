---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-testkit": patch
---

`cell(column, at)` and `r.cell(column, at)` of a sheet take computed moves, so a formula over an array can read the last key. A read with a computed move gives the same result in the interpreter, in tier 2 and in a standalone module. This is also true on a cycle that only the values make (`SHEET.CELL.COMPUTED`, `COMPILE.MODULE.SHEET.COMPUTED`).

A module reads a cell in the expression of a move before a move that can fail, as the interpreter does. Before this change, such a module could miss a cycle.

The random sheets of the test kit have reads at a computed position. Before 1.0.0, a new feature raises PATCH.
