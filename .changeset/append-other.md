---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

With `fuse`, a step of a loop appends into the array of its name when a branch of the step gives another list (COMPILE.MODULE.APPEND.OTHER). A `let` can bind such a branch, and its body can append to the new name. A step that a later step reads by `count`, `nth`, `first` or a fold over the axis `list` prints after that step (COMPILE.MODULE.APPEND.LATE). Before, each such append copied the list, so n appends cost O(n squared). The values and the errors stay the values and the errors of the interpreter.
