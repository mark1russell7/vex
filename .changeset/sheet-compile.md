---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
---

A `SheetRun` takes the option `compile`, for example `tiered` of `@mark1russell7/vex-compiler` (SHEET.COMPILE). The run evaluates each formula of a column with its compiled program, and the results stay the results of the interpreter. A formula compiles once for each compiler and its options, also across runs. The test kit exports the arbitraries of random sheets: `arbSheet`, `arbTwoTables` and `arbSheetFormula`.

`SheetRun.fill(table)` evaluates each cell of a table in a static order (SHEET.FILL): each column after the columns that it reads, and the keys in the order of its reads from itself. A fill of 20000 rows takes 13 to 26 ms, and the search before took 160 ms. The results of a run are in a map for each column, so the search is faster too. A key of an array space finds its record by its position.
