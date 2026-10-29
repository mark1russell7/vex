---
"@mark1russell7/vex-compiler": patch
---

`fuse: true` is the default. With it, an append into the list of a name of a loop takes a clean and fresh first list as its own array (COMPILE.MODULE.FUSE.ADOPT). Thus the first append makes no copy. An append of the result of the loop pushes into the array of the loop when no other part of the result reads the list. The values and the errors do not change. With `fuse: false`, a module prints the code of the version before.
