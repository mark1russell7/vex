---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

With `fuse`, an `each` over the axis `list` whose body is the name of the item gives the array of its list (COMPILE.MODULE.EACH.SAME). Before, the module copied the list item by item into a new array. The value is not fresh, so no op changes that array in place. The values and the errors stay the values and the errors of the interpreter.
