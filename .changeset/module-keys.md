---
"@mark1russell7/vex-compiler": patch
---

`emitModule` and `emitSheetModule` have the option `keys` (COMPILE.MODULE.KEYS). With `keys: true`, a run takes the keys of its records as its last argument. Then `get`, `without`, each `vex.list` and the move `key` use the keys of the host, as the interpreter does. A program that reads no key of a record prints the same text as without the option.
