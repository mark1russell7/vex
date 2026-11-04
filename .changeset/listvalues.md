---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
---

The generated code of `@mark1russell7/vex-compiler` takes the list ops on list values, list literals and `fill`. A program with `get`, `nth`, `append`, `take`, `sortBy` and the other list ops is in tier 2. It gives the results of the interpreter (COMPILE.LIST.VALUE). The core exports `listOps`, the list ops of `compile` for the values of a host (LIST.OPS). The rule is PATCH before 1.0.0: this is a new feature that keeps each result.
