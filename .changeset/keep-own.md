---
"@mark1russell7/vex-compiler": patch
---

With `fuse`, a filter of the list of a loop in a branch of its step works in place (COMPILE.MODULE.APPEND.KEEP). The filter moves the kept items down in the array of the loop, and the next append pushes into that array with no copy. Each other list gets a new array. The values and the errors do not change.
