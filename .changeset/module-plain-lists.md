---
"@mark1russell7/vex-compiler": patch
---

`emitModule` and `emitSheetModule` have the new option `lists` (COMPILE.MODULE.LIST.PLAIN). The default `"envelope"` prints the same module as before. With `lists: "plain"`, a list field of the input is an array of the values of its items. The key of an item is the text of its position.

The value of the run and a column of lists give plain arrays. An error item is the `VEX_ERROR` of the module in both directions. A list in a record or in an argument of an op stays a `vex.list`.
