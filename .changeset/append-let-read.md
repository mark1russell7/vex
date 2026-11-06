---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

A module appends in place in two more forms of a step of a loop. A `let` can bind the append to a new name, and the body can read that name and give another list (COMPILE.MODULE.APPEND.LET). A step before the step of the name can read the list with `count`, `nth`, `first` or a fold over the axis `list` (COMPILE.MODULE.APPEND.READ). Before, each such step copied the whole list at each append. The values and the errors stay the values and the errors of the interpreter.
