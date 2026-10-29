---
"@mark1russell7/vex-compiler": patch
---

With `fuse: true`, the default, a module prints a chain of `append` with a part that pushes as one output (COMPILE.MODULE.FUSE). Each part pushes its items in order, with no `concat`. `sortBy` over a clean and fresh list sorts that array in place, in a stable order. The values and the errors do not change (COMPILE.MODULE.FUSE.ITEM). With `fuse: false`, a module prints the code of the version before.
