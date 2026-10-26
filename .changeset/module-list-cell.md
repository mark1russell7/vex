---
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

A cell of a sheet module can hold a list (COMPILE.MODULE.SHEET.LIST). A later formula reads the list with the list ops, `get`, `indexOf`, the axis `list`, a `let` and the names of a loop. A column of lists that a formula reads before its own formula takes a `ListKind` in the option `kinds`, for example `{ list: "number" }`. The new type `ListKind` is an export.

The value of a program in `emitModule` can be a list too, and `if` and `ifError` take lists as branches (COMPILE.MODULE.LIST.RESULT). The run gives each list as a `vex.list` with the keys as text, and an error item has the error `VEX_ERROR`. A program whose value is a list gave the reason "a list is a value of the program" before, and at this time it gives a module. Thus the tool `vex_module` gives a module for such a program.

The level is PATCH: the change adds a feature and keeps each earlier result. Before 1.0, a backward-compatible feature is a PATCH. The option `kinds` takes more values, and the modules of the earlier programs do not change.
