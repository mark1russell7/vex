---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

A module makes no array for a list of `fill` when only `count` or a loop over the axis `list` reads it (COMPILE.MODULE.FILL.RANGE). This is also true through `take`. The loop goes over the count, which has the checks of `fill` and `take`. Before, the module made an array of pairs only to read its length. The values and the errors stay the values and the errors of the interpreter.
