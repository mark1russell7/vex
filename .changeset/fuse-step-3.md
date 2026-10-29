---
"@mark1russell7/vex-compiler": patch
---

With `fuse: true`, the default, a module prints the clean form of a list op where the facts prove the list clean (COMPILE.MODULE.FUSE.CLEAN). The clean form has no scan for error items and no test of the sentinel. The values and the errors do not change. With `fuse: false`, a module prints the code of the version before.
