---
"@mark1russell7/vex-compiler": patch
---

`emitModule` and `emitSheetModule` have the new option `fuse`, with the default `true` (COMPILE.MODULE.FUSE.OFF). In this version, both values print the same code. The printer also keeps the facts `clean` and `fresh` of each list and the count of the reads of each list node (COMPILE.MODULE.FUSE.FACTS). These facts do not change the printed code. The bench gate has a new case: the shapes module of ireko against its hand code.
