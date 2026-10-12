---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
---

The types of the builder accept each form of a number for a parameter with `liftScalar`: a number, a field with numbers, an argument and a chain. Before, they accepted only a number literal, but the interpreter lifts each form (spec TYPE.LIFT and CALL.LIFT). The flock pilot found the gap: a sum of vectors divided by a count did not compile.
