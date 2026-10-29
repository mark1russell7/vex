---
"@mark1russell7/vex-compiler": patch
---

With `fuse: true`, the default, an append of `fill(1, x)` into the array of its loop pushes the item `[0, x]` directly (COMPILE.MODULE.FUSE.ADOPT). It makes no list of `FI` and uses no `AOC`. When a `let` can bind the name to another list, the push has the check `l === w`. When the check fails, `AOC` or `AO` copies the list. The values and the errors do not change. With `fuse: false`, a module prints the code of the version before.
