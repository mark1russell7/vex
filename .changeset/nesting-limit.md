---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
---

`emitModule` and `emitSheetModule` refuse a program nested deeper than 500 levels, with the reason of the interpreter (V-088). Before this change, a module of such a program gave a value where the interpreter gives `#VALUE!`. A program of many thousand levels gave a `RangeError`. The published 0.17.2 has both faults. A program that printed a value past the limit gets a refusal at this time, so this change is a break, and it raises MINOR. `@mark1russell7/vex` has the new export `nestingError`.
