---
"@mark1russell7/vex-compiler": patch
---

With `fuse: true`, the default, a module prints `flat` over an `each` as one loop with one output (COMPILE.MODULE.FUSE). The module does not print the list of the `each`. A body of `if` pushes from its branch, and `fill(1, v)` pushes `v`. The values and the errors do not change (COMPILE.MODULE.FUSE.ITEM). With `fuse: false`, a module prints the code of the version before.
