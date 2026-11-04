---
"@mark1russell7/vex-compiler": minor
---

A list of a result of a module is a frozen `vex.list`, as in the interpreter. Each form gets this change: the value of a run, a column of lists of a sheet and a module of `fuse` false. With `fuse`, a value of `emitModule` that does not depend on the key has one `vex.list` for each run. Each key gets that object (COMPILE.MODULE.FUSE.OUT).

This is a breaking change before 1.0.0, so it raises MINOR. A host that changes a list of a result gets a `TypeError` in strict code, or no change. A host that compares the lists of two keys by identity gets the same object. The values and the errors do not change. A plain array of `lists: "plain"` does not change.
