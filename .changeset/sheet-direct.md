---
"@mark1russell7/vex-compiler": patch
---

A sheet module fills its cells with no search when each read of a cell reads a finished cell (COMPILE.MODULE.SHEET.DIRECT). Each loop puts the value of a formula into the array of its column. The module is smaller and faster, and its results do not change.

A read of an earlier column reads a finished cell. A read of the same column reads a finished cell in three forms. These are the parent in pre-order, the children in post-order and an earlier key of an array.

The level is PATCH: no exported type changes, and the results stay the same. Before 1.0, a backward-compatible change is a PATCH.
