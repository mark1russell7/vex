---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
"@vex/sheet-app": minor
---

A cell of a sheet can have its own formula (spec SHEET.CELL.FORMULA). That formula replaces the formula of its column at its key, and the other keys keep the formula of the column. `SheetRun` takes the formulas of cells in the option `cells`, and the builder has `sheet().cellFormula(k, column, formula)`. The formula of a cell must give a value of the type of its column. `ReferenceSheetRun` of the testkit takes the formulas of cells too.

In the sheet app, the button **Own formula** gives the selected cell its own formula, and the grid marks that cell. The first month of the loan example has its own formulas, so its columns need no `IFERROR`.
