---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
---

Vex does not depend on the call stack of the engine.

- A `SheetRun` reads its cells from a work list. A chain of 100000 cells, or a tree 100000 levels deep, gives its value in each read order (spec SHEET.DEEP).
- `isExpr`, `deps` and the new `nestingOf` use a loop with their own stack. An expression can nest `MAX_NESTING` (500) levels deep. A deeper expression gives `#VALUE!` before the evaluation (EVAL.NESTING).
- A full call stack in host code, for example a recursive op or extension handler, gives the new code `#DEPTH!` with the kind `depth`. `ifError`, a non-strict reduction and `#ARGS` do not hide it (EVAL.DEPTH, V-050). Before, the overflow was `#CALC!`, so `ifError` gave its fallback, and a sheet showed a wrong number.
- `serialize` and `parse` give `#DEPTH!` for data that is too deep, not an exception.
- The new helpers `isStackOverflow` and `isDepthError` find the overflow.
- The testkit exports `ReferenceSheetRun`, the recursive form of the search, as an oracle for the tests of `SheetRun`.
