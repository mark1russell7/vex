---
"@mark1russell7/vex-compiler": minor
---

With `fuse`, a value of `emitModule` that does not depend on the key has one `vex.list` for each run. Each key gets that object, so the object is frozen, with its array of items and its nested lists (COMPILE.MODULE.FUSE.OUT). Each other list of a result is not frozen, as in version 0.17.2 (COMPILE.MODULE.LIST.RESULT). These lists are a value that reads a key, a column of lists of a sheet and each list of a module of `fuse` false.

This is a breaking change before 1.0.0, so it raises MINOR. A host that changes the shared list gets a `TypeError` in strict code, or no change. A host that compares the lists of two keys by identity gets the same object. The values and the errors do not change. A plain array of `lists: "plain"` does not change.
