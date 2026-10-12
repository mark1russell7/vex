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
- **[FORMULA.NAV]** `this.`, `parent.` and `row(n).` before a name are moves of the address of the read. They are `origin`, `parent` and `offset(n)`, and they apply in sequence. In a tree space, `row(-1)` is the previous sibling (spec `NAV.OFFSET.TREE`). `n` must be a whole number.

## 4. Operators

- **[FORMULA.OPERATOR]** The operators `+`, `-`, `*`, `/`, `^` and `&` apply ops of the domain of the value on the left. The ops are `add`, `subtract`, `multiply`, `divide`, `pow` and `concat`. A minus sign before a value applies `negate`. A minus sign before a number gives a negative number.
- **[FORMULA.COMPARE]** The comparisons `=`, `<`, `<=`, `>` and `>=` apply `eq`, `lt`, `lte`, `gt` and `gte`. `a <> b` is `not(eq(a, b))`.
- **[FORMULA.PRECEDENCE]** The order of the operators is the order of a spreadsheet. A minus sign before a value comes first, then `^`, then `*` and `/`, then `+` and `-`, then `&`, and last the comparisons. Each operator with two values is left-associative, also `^`. Parentheses change the order.

## 5. Functions

A function name has no difference between capital and small letters.

- **[FORMULA.IF]** `IF(test, then, else)` is the form `if`: only one branch evaluates. Without `else`, the value is `FALSE`. IF takes 2 or 3 arguments.
- **[FORMULA.IFERROR]** `IFERROR(value, fallback)` is the form `ifError`. It takes 2 arguments.
- **[FORMULA.LOGIC]** `AND(...)` and `OR(...)` are the forms `and` and `or`, with one or more arguments. They stop at the first argument that decides the result. `NOT(test)` is the op `not`.
- **[FORMULA.OP]** Each other function name is an op of the standard domains, for example `DISTANCE(a, b)` is `app("distance", a, b)`. The first argument is the value whose domain has the op. A function with no arguments, or a name that is not an op, is an error.
- **[FORMULA.DOMAINS]** The standard domains are `NumDomain`, `BoolDomain`, `TextDomain`, `Vec2Domain`, `ColorDomain` and `AngleDomain`, in that order. `FORMULA_DOMAINS` gives them, for the evaluation of a sheet.
- **[FORMULA.FUNCTIONS]** `FUNCTIONS` describes each built-in function and each op of the standard domains, with a signature and a summary.

## 6. Aggregates

- **[FORMULA.AGGREGATE]** `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ANY` and `ALL` with an axis as the first argument are reductions of a list. The axes are `children`, `descendants`, `ancestors`, `siblings`, `others` and `all`. `SUM(children.cost)` reads the column at each row of the axis. `SUM(children, cost * qty)` evaluates the second argument at each row of the axis. `COUNT(children)` counts the rows of the axis.
- **[FORMULA.AGGREGATE.STRICT]** An error at one row of the axis makes the aggregate an error, like a spreadsheet. To skip the errors, use `IFERROR` in the value, for example `SUM(children, IFERROR(cost, 0))`.
- **[FORMULA.AGGREGATE.WHERE]** `SUM(children WHERE cost > 10, cost)` keeps the rows of the axis where the test is `TRUE`. In the test and in the value, a name reads at the row of the axis, and `this.name` reads at the row of the formula.
- **[FORMULA.AGGREGATE.ADDRESS]** Navigation before the axis is the address of the axis: `SUM(parent.children.cost)` sums the costs of the children of the parent.
- **[FORMULA.AGGREGATE.OP]** Without an axis, `MIN`, `MAX` and `SUM` are ops of the domains, for example `MIN(a, b)` of two numbers. `AVERAGE`, `COUNT`, `ANY` and `ALL` without an axis are errors.
- **[FORMULA.RANK]** `RANK(value)` is 1 plus the number of other rows with a larger value. An error at another row makes the rank an error. `RANK` is not valid inside an aggregate.

## 7. The results of the compiler

- **[FORMULA.READS]** `reads` gives each column that the formula reads, one time, in the sequence of the first read.
- **[FORMULA.ROUND-TRIP]** The text of a syntax tree, read again, gives the same expression as the tree.
- **[FORMULA.SHEET]** On a table, the sheet evaluation of the compiled formulas gives the same results as the reference evaluator of `@mark1russell7/vex-testkit`.
- **[FORMULA.CHAIN]** `toVexChain(expr)` gives a Vex chain as text. The Lab reader reads the text, and the chain gives the same result as the expression at each row.
- **[FORMULA.HIGHLIGHT]** `highlightFormula(text)` does not throw. The text of its pieces, in sequence, is the text.
