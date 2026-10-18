# @mark1russell7/vex

## 0.8.0

### Minor Changes

- 431bea0: A binding of `let` can be a function: `fn(params, body)`. The node `call(name, ...args)` applies it (FN.BIND, FN.CALL). The body evaluates at the position of the call, with the names of the place of its binding. A function cannot call itself, so each call ends (FN.TOTAL). `deps` reads the body at each call. Tier 2 puts the body at each call, in at most 10000 places. A standalone module prints one JavaScript function for each function and each set of kinds of its arguments. The JSON Schema of the IR has the two nodes. The reference interpreter and the random programs of the test kit have functions too.
  
  In the builder, `root.fn(kinds, body)` makes a function with the kinds of its parameters (BUILD.FN). `functions(fns, body)` of a chain binds functions and gives a typed call of each.
- f85789c: Lists as values. A `let` binds a list, and a list op applies to its name (LIST.VALUE). The axis `list(expr)` has the keys of the items of a list as targets, in the order of the list (AXIS.LIST). `sortBy(list)` sorts the items by their values, `take(list, n)` gives the first items and `nth(list, i)` gives one value. Tier 2 gives a reason for a program with lists, and tier 1 evaluates it. A standalone module keeps each list as an array. The reference interpreter and the random programs of the test kit have lists too.
  
  A list chain of the builder has `sortBy()`, `take(n)`, `nth(i)` and `each(body)`, the axis list over its items (BUILD.LIST.ORDER).
- 1520434: The axis `reverse(axis)` has the targets of an axis in the reverse order, from the last to the first (AXIS.REVERSE). The inner axis is a base axis: not `where`, `reverse` or `table`. A fold over it starts at the last target, for example to pack a row from its last child. The builder has the option `reverse: true` of each axis. Tier 2 and a standalone module loop from the end, and the reference interpreter and the random programs of the test kit have the axis too.

## 0.7.0

### Minor Changes

- 344f306: The moves `key` and `index` take an expression for the key or the position (NAV.COMPUTED), as `INDEX` of a spreadsheet. The expressions of an address evaluate first, at the node, and then the moves apply. A key that is not a text, or a position that is not a number, gives `#VALUE!`. `deps` keeps the expression in the address and gives its reads (DEPS.COMPUTED). The builder takes a chain in `.index()` and `.to()`.
  
  The type `Move` now has `key: string | Expr` and `i: number | Expr`. The new type `FixedMove` has only fixed values: `applyMove`, `resolveAddr` and a cell reference take it, and `fixAddr` gives it. A cell reference takes only fixed moves. The reference interpreter and the random programs of the test kit have computed moves. Tier 2 and the standalone modules evaluate them with no fallback.
- 6a9728e: Kinds of domains (KIND.DOMAIN): a value of a domain without a primitive type has the kind `domain:Name`. An op with `returns: "domain"` gives this kind, a schema can declare it for a field, and a site on such a value is static. Thus a standalone module can hold the values of a kernel: a domain of plain data, for example a structure that a fold builds. A domain declares `samples`, and a module checks each copy of an op with them. A module checks a field of such a kind with a copy of `is` of the domain.
- e6a565f: The kinds (KIND.PRIMITIVE, KIND.RETURNS, KIND.STATIC). A domain can declare `primitive`, the JavaScript type of its values, and an op can declare `returns`, the kind of its result. The scalar domains declare both, and the law checker of the test kit checks both. `generate` and `tiered` take a `schema` with the kinds of the fields and the variables. An op site whose values have known kinds calls its op with no guard, and a value against the schema goes to tier 1.
- 7c2d0c3: Bounded loops: the expressions `fold` and `iterate` (LOOP.NAMES, FOLD.ORDER, FOLD.ERROR, ITERATE.LIMIT, ITERATE.UNTIL, ITERATE.ERROR). `init` gives the names of a loop and their first values, and `step` gives the next values. A fold makes one step at each target of an axis, in order. An iteration makes up to `limit` steps, a whole number from 0 to 100000, and a true `until` stops it. `result` gives the value. The builder has `fold` on a list chain and `iterate` on a chain. The reference interpreter and the random programs of the test kit have the loops. Tier 2 and the standalone modules compile them to loops with a variable for each name, and a loop that reads no key of the run evaluates once for each run.
- 9987fb6: A `SheetRun` takes the option `compile`, for example `tiered` of `@mark1russell7/vex-compiler` (SHEET.COMPILE). The run evaluates each formula of a column with its compiled program, and the results stay the results of the interpreter. A formula compiles once for each compiler and its options, also across runs. The test kit exports the arbitraries of random sheets: `arbSheet`, `arbTwoTables` and `arbSheetFormula`.
  
  `SheetRun.fill(table)` evaluates each cell of a table in a static order (SHEET.FILL): each column after the columns that it reads, and the keys in the order of its reads from itself. A fill of 20000 rows takes 13 to 26 ms, and the search before took 160 ms. The results of a run are in a map for each column, so the search is faster too. A key of an array space finds its record by its position.
- 159c1ab: V-053: A node with a tag that the version does not know made `compile` throw a `TypeError`, for example a program with `fold` in 0.6.0. Now `compile`, `evaluate` and a sheet check the shape of the expression first (EVAL.SHAPE). An expression that is not valid gives `#VALUE!` with the reason. The new function `shapeError` gives the reason. The compiler gives the same error through tier 1, and `emitModule` gives the reason.
- 124a3d4: The new package `@mark1russell7/vex-compiler` turns a program into JavaScript source. `tiered(expr, options)` gives a program with the interface of `compile`, and its results are the results of the interpreter (COMPILE.TIERED, property P17). The source has the fast path of each op site for the domains of the options. On the programs of the speed lane, the generated code is 1.0 to 1.13 times the hand-written loops, and 70 to 110 times faster than `compile`. Where it cannot give a result, `compile` gives it (COMPILE.FALLBACK). A program keeps the value of each node that depends only on the space, for example the total of a column, so a run at each key of a space costs O(n) (COMPILE.MEMO). A node that reads the origin only through a few values has an entry for each value, so an aggregate by group evaluates once for each group (COMPILE.GROUP).
  
  The core exports `isFieldName`, `safeIs` and `matchesKind` for the compiler. Each space of the core has `records`, the records in the order of the keys (SPACE.RECORDS).
- 2383c3b: Vectors as plain data, for a standalone module. `XYDomain` has the component-wise ops of `Vec2Domain` for `{ x, y }` objects, and each op is a function, so `emitModule` can copy the domain. The op `xy` of `NumDomain` makes a value of it. An op can declare a result of another domain with `returns: "domain:Name"` (KIND.RETURNS): the compiler knows the kind of the result, and the law checker of the test kit checks such a result when its new option `domains` has that domain.

## 0.6.0

### Minor Changes

- a6111da: A cell of a sheet can have its own formula (spec SHEET.CELL.FORMULA). That formula replaces the formula of its column at its key, and the other keys keep the formula of the column. `SheetRun` takes the formulas of cells in the option `cells`, and the builder has `sheet().cellFormula(k, column, formula)`. The formula of a cell must give a value of the type of its column. `ReferenceSheetRun` of the testkit takes the formulas of cells too.
  
  In the sheet app, the button **Own formula** gives the selected cell its own formula, and the grid marks that cell. The first month of the loan example has its own formulas, so its columns need no `IFERROR`.
- ae7a253: `space.graph(records, edges)` makes a graph space: records by key, and the edges from each key (spec SPACE.GRAPH). A graph can have cycles. The axes `successors`, `predecessors` and `reachable` follow the edges (spec AXIS.GRAPH), and the builder has `.successors()`, `.predecessors()` and `.reachable()`. In a tree space, the edges go from a parent to its children, so the axes work there too. The arbitraries of the testkit make graph spaces, and the property P16 checks the axes against the edges.
- 01b8d2a: The axis `table(name)` has each key of another table of the evaluation as a target (spec AXIS.TABLE). Its body and its test evaluate in the space of that table, and there the origin is the target, so a value of the first space goes in through a variable. The option `tables` of an evaluation gives the spaces by name, and the builder has `.table(name, body)`.
  
  A `SheetRun` can have more tables (spec SHEET.TABLES): the option `tables` gives each table with its space, its columns and the formulas of its cells, and the option `name` names the main table. `cell`, `warm` and `explain` take the name of a table. One search covers the cells of all the tables, so a cycle across tables gives `#CYCLE!`. The reference interpreter and `ReferenceSheetRun` of the testkit have the tables too, and the properties P8, P15 and the scheduler property compare them with the core.
- ac85b6d: The axis `window(from, to)` has the keys at the offsets from `from` to `to` of the focus, in order (spec AXIS.WINDOW). In a tree space, the offsets go among the siblings. The builder has `.window(from, to, body)`, and the JSON Schema of the IR has the axis. The arbitraries and the builder model of the testkit make windows too, and the property P14 checks the targets.
  
  The formula language writes the axis as `rows(from, to)`, for example `AVERAGE(rows(-2, 0).Sales)` (spec FORMULA.AGGREGATE.WINDOW). The sheet app has a new example, monthly sales, with a moving average, a total for the year and the best month so far.

## 0.5.0

### Minor Changes

- 918c6e8: Vex does not depend on the call stack of the engine.
  
  - A `SheetRun` reads its cells from a work list. A chain of 100000 cells, or a tree 100000 levels deep, gives its value in each read order (spec SHEET.DEEP).
  - `isExpr`, `deps` and the new `nestingOf` use a loop with their own stack. An expression can nest `MAX_NESTING` (500) levels deep. A deeper expression gives `#VALUE!` before the evaluation (EVAL.NESTING).
  - A full call stack in host code, for example a recursive op or extension handler, gives the new code `#DEPTH!` with the kind `depth`. `ifError`, a non-strict reduction and `#ARGS` do not hide it (EVAL.DEPTH, V-050). Before, the overflow was `#CALC!`, so `ifError` gave its fallback, and a sheet showed a wrong number.
  - `serialize` and `parse` give `#DEPTH!` for data that is too deep, not an exception.
  - The new helpers `isStackOverflow` and `isDepthError` find the overflow.
  - The testkit exports `ReferenceSheetRun`, the recursive form of the search, as an oracle for the tests of `SheetRun`.

## 0.4.0

### Minor Changes

- 85849fe: Fix V-043: the moves before an axis are now the address of the axis, so `parent().children(body)` evaluates `body` at each child of the parent. Before, the builder dropped the moves, and the axis started at the origin. The IR node `each` has an optional address `at` (spec AXIS.ADDRESS), `deps` gives the address of each axis, and the test kit generates and checks axes with an address (property P12).
- 5d91ac8: `if(then, otherwise)` on a boolean chain gives the form `if` (spec BUILD.IF). Only the selected branch evaluates. Before, a program had to use `ifError` tricks that also hide real errors.
- 2b67de2: Add the WCAG 2.1 ops `relativeLuminance` and `contrast` to `ColorDomain`. The old op `luminance` applies the Rec. 709 weights to the raw channels without the sRGB transfer function, so it does not give the contrast ratios of WCAG. The palette pilot found the gap.
- 41cf9d6: An empty `reduce` gives the identity of the op only when exactly one domain has an identity for it. When more domains have one, the result is `#N/A` with their names, and the new option `reduce(op, { domain })` names the domain to use (V-049, spec LIST.REDUCE.EMPTY). Before, an empty sum of vectors could be the number 0.
- 6a9bdf5: The JSON form of a literal keeps every value. A record with the key `$vex` gets an escape form (V-045, spec IR.JSON.ESCAPE), and `-0`, `NaN` and the infinities get a number form (V-046, spec IR.JSON.NUMBER). A domain value can be in a list or a record of a literal. A file from an older version reads as before.
- c5fb3c5: A list chain has `keys()` and `errors()` (spec BUILD.LIST.KEYS). `keys()` gives the keys of the items with a value, in the order of the axis, and `errors()` gives the error of each item that failed. The IR had both list ops, and the builder now offers them. The Lab reads them too.
- 7aa0e40: A list chain gives its list at an origin with `result`, `at` and `explain` (spec BUILD.LIST.READ). Before, a host evaluated the program of the list chain by hand to read the key of each item.
- c5f39ec: Add `TextDomain`, the domain of texts, with the ops `concat`, `length`, `upper`, `lower`, `trim`, `contains` and `eq`. `concat` joins a text and a value of any kind, like the operator `&` of a spreadsheet.
- 8d22fea: In a tree space, `offset(d)` with one number moves among the siblings in key order (spec NAV.OFFSET.TREE). For example, `offset(-1)` goes to the previous sibling, so a running total works in each group of a tree.

### Patch Changes

- 0badf4c: Fix V-048: a first read of a cell at the end of a long recurrence went deep into the call stack. The overflow became an error value, and `ifError` gave its fallback, so a sheet showed a wrong number without an error. `SheetRun.cell` now evaluates the column in key order up to the key (spec SHEET.RECURRENCE).
- 580487f: Fix V-044: a domain value with `toJSON`, for example a `Vec2`, now round-trips through `serialize` and `parse`. Before, `serialize` wrote the `toJSON` form, and `parse` gave a plain object. The test kit adds the builder model test (`arbChain`, `runChain`, `modelChain`), and `referenceEvaluate` takes the free functions (`fns`).
- 58f7475: The types of the builder accept each form of a number for a parameter with `liftScalar`: a number, a field with numbers, an argument and a chain. Before, they accepted only a number literal, but the interpreter lifts each form (spec TYPE.LIFT and CALL.LIFT). The flock pilot found the gap: a sum of vectors divided by a count did not compile.

## 0.3.0

### Minor Changes

- 07e271e: Add typed free functions: `vex(...).withOptions({ fns })` keeps the types of the functions, and `chain.call(name, ...args)` applies one with typed arguments and a typed result. Add `sheet().declare<T>()`, so a column can read itself or a later column with its type. `NDVector.get` and the test kit have small clean-ups, and every published package has a coverage gate.

### Patch Changes

- cb86b41: Add a README to each package (an example that a test checks, the features and the links), and the keywords, homepage, bugs and author fields.

## 0.2.0

### Minor Changes

- 855fcd5: Publish under the npm names `@mark1russell7/vex`, `@mark1russell7/vex-domains` and `@mark1russell7/vex-testkit`. The type `Optional` is the Optional of the family (`@mark1russell7/optional`); the declarations hold a copy of it, so there is no new runtime dependency.
- 6eff59c: Add sheets (`root.sheet()`, `cell()`, `#CYCLE!` with Tarjan's algorithm), `compile()` (the interpreter is now a closure compiler), `root.ext()`, and the location of extension errors (EVAL.LOCATION).
- c7983f5: Add tree spaces: `space.tree(records, parents)`, the move `parent()`, and the axes `children`, `ancestors`, `descendants` and `siblings`. The test kit generates tree spaces, and property P11 checks the tree axes against the parents.
