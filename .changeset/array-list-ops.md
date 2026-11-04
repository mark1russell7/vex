---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

Tier 2 gives a list op on an array with the code of the interpreter, so such a run needs no fallback to tier 1. `errors` of an array with a hole stays in tier 1, because its values have the position of the call. `listOps` has the new function `array` (COMPILE.LIST.ARRAY, LIST.OPS).
