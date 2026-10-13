# @vex/formula

## 0.2.0

### Minor Changes

- 330f714: `DateDomain` and `LocalDate`: a day of the calendar, without a time and without a time zone. A date plus some days is a date, and a date minus a date is a count of days. The ops are `add`, `subtract`, `addMonths`, `endOfMonth`, `year`, `month`, `day`, `weekday` and the comparisons. The op `date` of `NumDomain` makes a date from a year, a month and a day, and a month or a day outside its range rolls over.
  
  The formula language has `DATE`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `EDATE` and `EOMONTH` (spec FORMULA.DATE). The sheet app has date columns, a CSV import finds them, and a chart can use a column of dates for its horizontal axis. The new example is a list of invoices.
- 0c0d030: `NumDomain` has the ops `ln`, `exp` and `log10`. A result that is not finite, for example `ln(0)`, gives `#NUM!`.
  
  The formula language has the finance functions `PMT`, `FV`, `PV` and `NPER` of a spreadsheet, with its signs (spec FORMULA.FINANCE). Each function compiles to arithmetic, so the steps of a cell show the calculation. The tests compare each function with the examples of the documentation of Excel.
- 11f8c91: The formula language reads a row by its name: `row("Launch").Start` (spec FORMULA.NAV.NAME). A name of no row, or of two rows, is an error with its span. `X(v)` and `Y(v)` give the components of a vector.
  
  The sheet app gives each row the text of its first column as its name, when that column is a text column. It has seven new examples where formulas read other formulas: a page layout, rabbits and foxes, a project plan, a thrown ball, test scores, an org chart and a recipe. The link `#example=<id>` opens an example.
- 21d9f01: The sheet app has grids (spec FORMULA.GRID.ADDRESS, FORMULA.GRID.RANGE and FORMULA.GRID.ONLY). The columns of a grid have the letters A, B, C, and each cell keeps its text as its own formula. A text that starts with `=` is a formula. In a grid, `B2` and `$B$2` read a cell, an empty cell reads as 0, and an aggregate takes a range like `SUM(B2:D4)`. A range expands to a balanced tree of the cells that it reads, so it needs no new IR, and a cycle gives `#CYCLE!`. The button **New grid** starts a grid, and the price list is an example.
- a3ce6e5: A document of the sheet app is a book of tables, with a tab for each table (spec FORMULA.TABLE.AXIS, FORMULA.TABLE.ROW and FORMULA.TABLE.ERRORS). A formula reads another table with `table("title")`: an aggregate over its rows, for example `SUM(table("Products") WHERE Name = this.Item, Price)`, or one row by its name, `table("Products").row("Ink").Price`. Inside the axis of another table, `this.name` reads the row of the formula through a variable. One run has all the tables, so a cycle across tables gives `#CYCLE!`. The JSON file, the share link and the save in the browser keep each table, and the JSON of one table opens as a book with one table. The new example has orders and products.
- ac85b6d: The axis `window(from, to)` has the keys at the offsets from `from` to `to` of the focus, in order (spec AXIS.WINDOW). In a tree space, the offsets go among the siblings. The builder has `.window(from, to, body)`, and the JSON Schema of the IR has the axis. The arbitraries and the builder model of the testkit make windows too, and the property P14 checks the targets.
  
  The formula language writes the axis as `rows(from, to)`, for example `AVERAGE(rows(-2, 0).Sales)` (spec FORMULA.AGGREGATE.WINDOW). The sheet app has a new example, monthly sales, with a moving average, a total for the year and the best month so far.

### Patch Changes

- Updated dependencies [a6111da]
- Updated dependencies [330f714]
- Updated dependencies [0c0d030]
- Updated dependencies [ae7a253]
- Updated dependencies [01b8d2a]
- Updated dependencies [ac85b6d]
  - @mark1russell7/vex@0.6.0
  - @mark1russell7/vex-domains@0.6.0

## 0.1.2

### Patch Changes

- Updated dependencies [918c6e8]
  - @mark1russell7/vex@0.5.0
  - @mark1russell7/vex-domains@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [85849fe]
- Updated dependencies [5d91ac8]
- Updated dependencies [580487f]
- Updated dependencies [2b67de2]
- Updated dependencies [41cf9d6]
- Updated dependencies [6a9bdf5]
- Updated dependencies [58f7475]
- Updated dependencies [c5fb3c5]
- Updated dependencies [7aa0e40]
- Updated dependencies [c5f39ec]
- Updated dependencies [8d22fea]
  - @mark1russell7/vex@0.4.0
  - @mark1russell7/vex-domains@0.4.0
