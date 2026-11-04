---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

Tier 2 gives the result of the interpreter for an empty `reduce` in a context that catches an error. Tier 1 gives the identity of the op, also in `ifError`, in an item of a list op and in a test of `where`. A failed test of a data limit does not hide `#DEPTH!` of a later test (V-071, COMPILE.FALLBACK).
