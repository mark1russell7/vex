---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

A module reads each argument of a call in a sum over all the records in the scope of its declaration. Before, such a module threw `ReferenceError` or gave `VEX_ERROR` (V-094, COMPILE.MODULE). A failed property of the testkit gives its error as the cause.
