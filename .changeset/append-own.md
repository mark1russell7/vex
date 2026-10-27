---
"@mark1russell7/vex-compiler": patch
---

A fold that appends gives a list in linear time (COMPILE.MODULE.APPEND.OWN). In a module of `emitModule`, a step of a name of `fold` or `iterate` can append to the list of the name. When no other part of the loop reads the name, the first append copies the list. Each later append adds its items to that copy. Before, each step copied the whole list, so n appends cost O(n squared). Also, `count` and `first` of a list read the items with values that `nth` keeps (COMPILE.MODULE.NTH.INDEX). The values and the errors stay the values and the errors of the interpreter.
