---
"@mark1russell7/vex-compiler": patch
---

A standalone module takes the formula columns of a sheet (COMPILE.MODULE.SHEET). The new function `emitSheetModule` prints them, and the module gives the results of `SheetRun`. Each cell on a cycle gives `VEX_ERROR`, with the budget of the stack of `SheetRun`.

The level is PATCH: the function `emitSheetModule` and the type `SheetModuleOptions` are new, and no type changes. Before 1.0, a new feature is a PATCH.
