# The formula language

This document is the specification of the formula language of the sheet app ([`docs/SHEET-APP.md`](../docs/SHEET-APP.md)). The package `@vex/formula` implements it. A formula looks like a spreadsheet formula, and it compiles to an expression of the Vex IR ([`README.md`](./README.md)). The IR gives the semantics. Each normative statement has a requirement ID, and a test names each ID.

## 1. The model

A table is a tree space. Each row is a record, and a row without a parent is a root. A value column is a field of the records. A formula column is a column of a sheet: one formula for each column, and Vex evaluates it at each row. A formula reads the columns of its row, and it moves to other rows with navigation and axes.

`compileFormula(text, context)` gives the expression and the names of the columns that it reads, or an error. The context gives the names of the value columns and of the formula columns.

## 2. The text

- **[FORMULA.START]** A formula can start with `=`. White space between two tokens has no effect.
- **[FORMULA.LITERAL]** A number has digits, a decimal point and an exponent, for example `2`, `0.5`, `.5` and `1e3`. A number that is not finite is an error. A text is in double quotes, and two double quotes in a text are one quote. `TRUE` and `FALSE` are booleans, in capital or small letters.
- **[FORMULA.ERROR]** A problem gives an error with a message and the span of the text that has the problem. The compiler does not throw. A formula of more than 10000 characters is an error.

## 3. Names and navigation

- **[FORMULA.NAME]** A name is a word, or a text in square brackets: `cost` or `[Unit price]`. Brackets also make a name of a word of the language, for example `[children]`. The compiler looks for a column with the same name, and then for a column with the same name in small letters. A name with a dot is an error, and a name of no column is an error with its span.
- **[FORMULA.NAME.VALUE]** A name of a value column reads the field at the focus: `ref(name)`.
- **[FORMULA.NAME.FORMULA]** A name of a formula column reads the cell at the focus: the cell reference `cell(name)`. Thus a cycle of formula columns gives `#CYCLE!`, and the other cells stay correct.
- **[FORMULA.NAV]** `this.`, `parent.`, `row(n).` and `row("name").` before a name are moves of the address of the read. They are `origin`, `parent`, `offset(n)` and `key(k)`, and they apply in sequence. In a tree space, `row(-1)` is the previous sibling (spec `NAV.OFFSET.TREE`). `n` must be a whole number.
- **[FORMULA.NAV.NAME]** `row("name").` moves to the row with the name `name`. The context gives the keys of the rows of each name. A name of no row, or of two or more rows, is an error with its span. Without the names in the context, the name is the key of the row. The sheet app gives each row the text of its first column as its name, when that column is a text column.

## 4. Operators

- **[FORMULA.OPERATOR]** The operators `+`, `-`, `*`, `/`, `^` and `&` apply ops of the domain of the value on the left. The ops are `add`, `subtract`, `multiply`, `divide`, `pow` and `concat`. A minus sign before a value applies `negate`. A minus sign before a number gives a negative number.
- **[FORMULA.COMPARE]** The comparisons `=`, `<`, `<=`, `>` and `>=` apply `eq`, `lt`, `lte`, `gt` and `gte`. `a <> b` is `not(eq(a, b))`.
- **[FORMULA.CONCAT]** `&` joins the text of the two values, as in a spreadsheet. A number on the left side gives its text too, so `1 & "a"` gives `"1a"`.
- **[FORMULA.VEC]** `VEC(x, y)` gives the vector with the components `x` and `y`. The two values must be numbers. `X(v)` and `Y(v)` give the components of the vector `v`.
- **[FORMULA.NESTING]** A formula can nest parentheses, function calls and signs up to 200 levels deep. A deeper formula gives an error with its position.
- **[FORMULA.PRECEDENCE]** The order of the operators is the order of a spreadsheet. A minus sign before a value comes first, then `^`, then `*` and `/`, then `+` and `-`, then `&`, and last the comparisons. Each operator with two values is left-associative, also `^`. Parentheses change the order.

## 5. Functions

A function name has no difference between capital and small letters.

- **[FORMULA.IF]** `IF(test, then, else)` is the form `if`: only one branch evaluates. Without `else`, the value is `FALSE`. IF takes 2 or 3 arguments.
- **[FORMULA.IFERROR]** `IFERROR(value, fallback)` is the form `ifError`. It takes 2 arguments.
- **[FORMULA.LOGIC]** `AND(...)` and `OR(...)` are the forms `and` and `or`, with one or more arguments. They stop at the first argument that decides the result. `NOT(test)` is the op `not`.
- **[FORMULA.OP]** Each other function name is an op of the standard domains, for example `DISTANCE(a, b)` is `app("distance", a, b)`. The first argument is the value whose domain has the op. A function with no arguments, or a name that is not an op, is an error.
- **[FORMULA.FINANCE]** `PMT(rate, nper, pv, [fv], [type])`, `FV(rate, nper, pmt, [pv], [type])`, `PV(rate, nper, pmt, [fv], [type])` and `NPER(rate, pmt, pv, [fv], [type])` are the finance functions of a spreadsheet. They use its signs: money that you pay is negative. `fv` and `pv` are 0 by default, and the type 1 puts each payment at the start of its period. A rate of 0 has its own formula. Each function compiles to arithmetic, so the steps of a cell show the calculation. `RATE`, `NPV` and `IRR` are not functions of the language, because they need a numeric search or the position of an item in a list.
- **[FORMULA.DATE]** `DATE(year, month, day)` gives a date of `DateDomain`, and a month or a day outside its range rolls over. `YEAR`, `MONTH`, `DAY` and `WEEKDAY` give the parts of a date, with Sunday as day 1. `EDATE(date, months)` and `EOMONTH(date, months)` move by months. A date plus a number is a later date, and a date minus a date is the number of days between them. `TODAY` is not a function, because a formula is pure: it gives the same value each time.
- **[FORMULA.DOMAINS]** The standard domains are `NumDomain`, `BoolDomain`, `TextDomain`, `Vec2Domain`, `ColorDomain`, `AngleDomain` and `DateDomain`, in that order. `FORMULA_DOMAINS` gives them, for the evaluation of a sheet.
- **[FORMULA.FUNCTIONS]** `FUNCTIONS` describes each built-in function and each op of the standard domains, with a signature and a summary.

## 6. Aggregates

- **[FORMULA.AGGREGATE]** `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ANY` and `ALL` with an axis as the first argument are reductions of a list. The axes are `children`, `descendants`, `ancestors`, `siblings`, `others` and `all`. `SUM(children.cost)` reads the column at each row of the axis. `SUM(children, cost * qty)` evaluates the second argument at each row of the axis. `COUNT(children)` counts the rows of the axis.
- **[FORMULA.AGGREGATE.STRICT]** An error at one row of the axis makes the aggregate an error, like a spreadsheet. To skip the errors, use `IFERROR` in the value, for example `SUM(children, IFERROR(cost, 0))`.
- **[FORMULA.AGGREGATE.WHERE]** `SUM(children WHERE cost > 10, cost)` keeps the rows of the axis where the test is `TRUE`. In the test and in the value, a name reads at the row of the axis, and `this.name` reads at the row of the formula.
- **[FORMULA.AGGREGATE.ADDRESS]** Navigation before the axis is the address of the axis: `SUM(parent.children.cost)` sums the costs of the children of the parent.
- **[FORMULA.AGGREGATE.WINDOW]** `rows(from, to)` as the axis of an aggregate is the axis `window(from, to)`. Its rows are at the offsets from `from` to `to` of the row, among its siblings. For example, `AVERAGE(rows(-2, 0).Sales)` is the mean of the sales of this row and of the two rows before it. The offsets must be whole numbers.
- **[FORMULA.AGGREGATE.OP]** Without an axis, `MIN`, `MAX` and `SUM` are ops of the domains, for example `MIN(a, b)` of two numbers. `AVERAGE`, `COUNT`, `ANY` and `ALL` without an axis are errors.
- **[FORMULA.RANK]** `RANK(value)` is 1 plus the number of other rows with a larger value. An error at another row makes the rank an error. `RANK` is not valid inside an aggregate.

## 7. Grids

A grid sheet has the columns `A`, `B`, `C` and so on, and numbered rows. Each cell has a value or its own formula. The context of the compiler gives the columns, the rows and the kind of each cell that is not empty.

- **[FORMULA.GRID.ADDRESS]** In a grid, a name like `B2` is the address of a cell: the column `B` at row 2. It reads that cell with a cell reference. Dollar signs, as in `$B$2`, have no effect. An empty cell reads as 0, as in a spreadsheet.
- **[FORMULA.GRID.RANGE]** An aggregate takes a range of cells, for example `SUM(B2:D4)`. `SUM`, `AVERAGE`, `MIN`, `MAX` and `COUNT` take the cells of the range with a number or a formula. `ANY` and `ALL` take the cells with a boolean or a formula. Empty cells and texts do not count. For a range without such cells, `SUM`, `MIN`, `MAX` and `COUNT` give 0, `AVERAGE` gives `#NUM!`, `ANY` gives `FALSE` and `ALL` gives `TRUE`. A range has 10000 cells or fewer.
- **[FORMULA.GRID.ONLY]** A range outside an aggregate is an error, and an address outside the grid is an error. A range in a table is an error. In a table, a name like `B2` is the name of a column.

## 8. Tables

A document can have more tables. The context of the compiler gives the columns, the names of the rows and the column of the names of each other table.

- **[FORMULA.TABLE.AXIS]** `table("name")` as the axis of an aggregate has the rows of the table `name`, for example `SUM(table("Products").Price)`. In its test and its value, a name reads a column of that table, and `this.name` reads the row of the formula. The value of `this.name` comes in through a variable, because that row is not in the other table.
- **[FORMULA.TABLE.ROW]** `table("name").row("row").column` reads the column of the row with the name `row` in the table `name`. The name of a row is the text of the first column of its table. The compiler checks that exactly one row has the name.
- **[FORMULA.TABLE.ERRORS]** A table, a column of a table or a row name that does not exist is an error with its span. Two rows with the name, and a table without a column of names, are errors. `table("name").` comes first in the navigation, and a row of another table needs `row("name").` after it.

## 9. The results of the compiler

- **[FORMULA.READS]** `reads` gives each column that the formula reads, one time, in the sequence of the first read.
- **[FORMULA.ROUND-TRIP]** The text of a syntax tree, read again, gives the same expression as the tree.
- **[FORMULA.SHEET]** On a table, the sheet evaluation of the compiled formulas gives the same results as the reference evaluator of `@mark1russell7/vex-testkit`.
- **[FORMULA.CHAIN]** `toVexChain(expr)` gives a Vex chain as text. The Lab reader reads the text, and the chain gives the same result as the expression at each row.
- **[FORMULA.HIGHLIGHT]** `highlightFormula(text)` does not throw. The text of its pieces, in sequence, is the text.
