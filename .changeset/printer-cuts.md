---
"@mark1russell7/vex-compiler": patch
---

The module printer gives smaller code with the option `fuse` (COMPILE.MODULE.SIZE). A module has no empty `FI`, no unread key, no alias, no unread helper and fewer lazy cells and ops. The values, the errors and the refusals stay the same. The module of `NODE_SHAPE` has 275 fewer bytes after minify and gzip.
