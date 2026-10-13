---
"@mark1russell7/vex-compiler": minor
"@mark1russell7/vex": minor
---

The new package `@mark1russell7/vex-compiler` turns a program into JavaScript source. `tiered(expr, options)` gives a program with the interface of `compile`, and its results are the results of the interpreter (COMPILE.TIERED, property P17). The generated code is 35 to 75 times faster than `compile` on the programs of the speed lane. Where it cannot give a result, `compile` gives it (COMPILE.FALLBACK). The core exports `isFieldName`, `safeIs` and `matchesKind` for the compiler.
