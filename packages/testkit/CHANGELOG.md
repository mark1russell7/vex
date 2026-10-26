# @mark1russell7/vex-testkit

## 0.13.1

### Patch Changes

- @mark1russell7/vex@0.13.1

## 0.13.0

### Patch Changes

- @mark1russell7/vex@0.13.0

## 0.12.0

### Minor Changes

- ac4f97b: An array of a field or of a name is a list where a list op or the axis `list` needs a list (LIST.ARRAY). The key of each item is its position, from `"0"`. A position without a value, or with `null`, gives an error item of `#N/A`. Thus a layout reads a config array, for example `fr = [0.2, 0.3, 0.5]`, with `count`, `nth`, `take` and `list(...)`, and it needs no host functions for it.
  
  - `indexOf(list, value)` gives the position of the first item with the value, from 0, as `nth` counts (LIST.INDEXOF). The value is a number, a text or a boolean. A value that no item has gives `#N/A`.
  - `fill(n, value)` gives a list of `n` items with the value, and the positions as keys (LIST.FILL). `n` is a whole number from 0 to 100000.
  
  For an array, a domain or a function of the host with the op comes first. A program that gave `#VALUE!` for an array can give a value. For a list of Vex, the new ops come before a function of the host with the name `indexOf` or `fill`. Such a program can give a different value.
  
  Tier 2 gives a reason for `indexOf` and `fill`. A list op of tier 2 on an array goes to tier 1 at run time, so the tiers give the same result (P17). A standalone module gives a reason for these programs. The random programs of `@mark1russell7/vex-testkit` use the two new ops, and the catalog of `@mark1russell7/vex-mcp` has their rows.
  
  The level is MINOR. The new ops can change the result of a program with a function of the host named `indexOf` or `fill`. Before 1.0, such a change raises MINOR, as the list ops of block 1 did.

### Patch Changes

- Updated dependencies [ac4f97b]
  - @mark1russell7/vex@0.12.0

## 0.11.2

### Patch Changes

- Updated dependencies [5501948]
  - @mark1russell7/vex@0.11.2

## 0.11.1

### Patch Changes

- @mark1russell7/vex@0.11.1

## 0.11.0

### Minor Changes

- 9918bfb: Lists as the state of a loop, the second block of design E of the study of recursion. A name of `iterate` or `fold` can hold a list, and a step gives the next list from the old one (LOOP.LIST). `get(list, key)` gives the value of the first item with the key, and a key that no item has gives `#N/A` (LIST.GET). A literal can be a list, so the empty list and a list with one key start a stack or a seen set (LIST.LITERAL). Thus a force layout keeps all positions in one name, and each step reads the old positions by key.
  
  In the builder, a name of a loop whose first value is a list chain is a list chain in each step. A list chain as the result gives a list chain. `root.list(items)` makes a list literal, and a list chain has `get(key)` (BUILD.LIST.LOOP). The type `ListOp` has one more name, so a `switch` over it needs one more case. The types `LoopVars` and `LoopStep` change for names that hold lists.
  
  `isVexList` checks each item: a text key, and a value or an error value (LIST.SHAPE). Another value of the kind `vex.list` is a record, so no list op applies to it, and both tiers give `#VALUE!`. Before, a list op threw on such a value.
  
  Tier 2 and a module give a reason for these programs, and tier 1 evaluates them. The reference interpreter and the random programs of the test kit have them. The catalog of the MCP server lists `get` and the list literals.

### Patch Changes

- Updated dependencies [52c1e27]
- Updated dependencies [9918bfb]
  - @mark1russell7/vex@0.11.0

## 0.10.0

### Minor Changes

- 394465d: List ops that build lists, the first block of design E of the study of recursion. `drop(list, n)` gives the items after the first `n` items (LIST.DROP). `append(list, other)` gives the items of two lists (LIST.APPEND). `without(list, other)` removes the items with a key of `other` (LIST.WITHOUT). `flat(list)` joins the lists that are the values of the items (LIST.FLAT). Each item keeps its key and its value, and LIST.LENIENT applies to each list that an op reads (LIST.BUILD). Thus a search can keep its stack in a list.
  
  A list chain of the builder has `drop(n)`, `append(other)`, `without(other)` and `flat()`, and the body of an axis can give a list chain (BUILD.LIST.BUILD). The type `ListOp` has four more names, so a `switch` over it needs four more cases.
  
  Tier 2 and a module give a reason for the four ops, and tier 1 evaluates the program. The reference interpreter and the random programs of the test kit have the four ops. The catalog of the MCP server lists them.

### Patch Changes

- 59ef80d: coeval is the core of Vex (decision D13 of coeval, and decision D13 in `docs/REVIEW.md`). `@mark1russell7/coeval` ^0.6.0 is the one runtime dependency of `@mark1russell7/vex`, and the build does not copy it.
  
  - `VEX_WORLD` gives the contract of each kind of a document as data. The static kit of the kernel checks each document by it before `fromDocument` reads it (DOC.CHECK). The check uses `vexChecker`, a machine without the code of the evaluators, so a bundle that only reads documents does not hold them. A document that is not valid still gives `#VALUE!` with a JSON Pointer to the bad part, with the reason of the kernel. A computed key or position of a move can be a bare literal (DOC.MOVE).
  - `deps` finds the reads with the static kit of the kernel (`refsOf`). Its results do not change.
  - The kernel is the reference tier (EVAL.REFERENCE). `kernelPlan` gives the plan of a program in the kernel with `vexMachine`. The plan has `run`, `evaluate`, `reference` and `agree`. `reference` reads the document with the reference interpreter of the kernel, which compiles nothing. `agree` compares the tiers of the kernel with a tier that you give (EVAL.AGREE). `vexDefinitions` gives the definitions of the formula kit for the reference interpreter.
  - `referenceEvaluate` of the test kit uses the reference interpreter of the kernel. It takes a document too, and the options `vars` and `extensions`. The test kit has `arbChangedDocument`, `arbNumberExpr` and `arbNumberSpace`. The properties P19 to P22 compare the tiers with the kernel, and P17 compares the compiler with it too.
  - `toDocument` writes an expression of any depth.
  - `@mark1russell7/vex`, `@mark1russell7/vex-domains` and `@mark1russell7/vex-testkit` declare `"sideEffects": false`. No module of them has an effect at its import, so a bundler removes each module that a program does not use. The top level of the kernel has the annotation `__PURE__` too.
  - The MCP server ends the reason of a program that is not valid with one period, also when the reason of the kernel has its own period.
  - V-056: a program that is not an object, for example `0`, made `evaluate`, `explain` and a sheet with a compiler throw a `TypeError`. It gives `#VALUE!`.
  
  The API only grows, no export changes its type, and a document that is not valid still gives `#VALUE!`. Thus the level is patch (SemVer before 1.0).
- Updated dependencies [59ef80d]
- Updated dependencies [394465d]
  - @mark1russell7/vex@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [53ab73f]
  - @mark1russell7/vex@0.9.1

## 0.9.0

### Patch Changes

- @mark1russell7/vex@0.9.0

## 0.8.1

### Patch Changes

- @mark1russell7/vex@0.8.1

## 0.8.0

### Minor Changes

- 431bea0: A binding of `let` can be a function: `fn(params, body)`. The node `call(name, ...args)` applies it (FN.BIND, FN.CALL). The body evaluates at the position of the call, with the names of the place of its binding. A function cannot call itself, so each call ends (FN.TOTAL). `deps` reads the body at each call. Tier 2 puts the body at each call, in at most 10000 places. A standalone module prints one JavaScript function for each function and each set of kinds of its arguments. The JSON Schema of the IR has the two nodes. The reference interpreter and the random programs of the test kit have functions too.
  
  In the builder, `root.fn(kinds, body)` makes a function with the kinds of its parameters (BUILD.FN). `functions(fns, body)` of a chain binds functions and gives a typed call of each.
- f85789c: Lists as values. A `let` binds a list, and a list op applies to its name (LIST.VALUE). The axis `list(expr)` has the keys of the items of a list as targets, in the order of the list (AXIS.LIST). `sortBy(list)` sorts the items by their values, `take(list, n)` gives the first items and `nth(list, i)` gives one value. Tier 2 gives a reason for a program with lists, and tier 1 evaluates it. A standalone module keeps each list as an array. The reference interpreter and the random programs of the test kit have lists too.
  
  A list chain of the builder has `sortBy()`, `take(n)`, `nth(i)` and `each(body)`, the axis list over its items (BUILD.LIST.ORDER).
- 1520434: The axis `reverse(axis)` has the targets of an axis in the reverse order, from the last to the first (AXIS.REVERSE). The inner axis is a base axis: not `where`, `reverse` or `table`. A fold over it starts at the last target, for example to pack a row from its last child. The builder has the option `reverse: true` of each axis. Tier 2 and a standalone module loop from the end, and the reference interpreter and the random programs of the test kit have the axis too.

### Patch Changes

- Updated dependencies [431bea0]
- Updated dependencies [f85789c]
- Updated dependencies [1520434]
  - @mark1russell7/vex@0.8.0

## 0.7.0

### Minor Changes

- 344f306: The moves `key` and `index` take an expression for the key or the position (NAV.COMPUTED), as `INDEX` of a spreadsheet. The expressions of an address evaluate first, at the node, and then the moves apply. A key that is not a text, or a position that is not a number, gives `#VALUE!`. `deps` keeps the expression in the address and gives its reads (DEPS.COMPUTED). The builder takes a chain in `.index()` and `.to()`.
  
  The type `Move` now has `key: string | Expr` and `i: number | Expr`. The new type `FixedMove` has only fixed values: `applyMove`, `resolveAddr` and a cell reference take it, and `fixAddr` gives it. A cell reference takes only fixed moves. The reference interpreter and the random programs of the test kit have computed moves. Tier 2 and the standalone modules evaluate them with no fallback.
- e6a565f: The kinds (KIND.PRIMITIVE, KIND.RETURNS, KIND.STATIC). A domain can declare `primitive`, the JavaScript type of its values, and an op can declare `returns`, the kind of its result. The scalar domains declare both, and the law checker of the test kit checks both. `generate` and `tiered` take a `schema` with the kinds of the fields and the variables. An op site whose values have known kinds calls its op with no guard, and a value against the schema goes to tier 1.
- 7c2d0c3: Bounded loops: the expressions `fold` and `iterate` (LOOP.NAMES, FOLD.ORDER, FOLD.ERROR, ITERATE.LIMIT, ITERATE.UNTIL, ITERATE.ERROR). `init` gives the names of a loop and their first values, and `step` gives the next values. A fold makes one step at each target of an axis, in order. An iteration makes up to `limit` steps, a whole number from 0 to 100000, and a true `until` stops it. `result` gives the value. The builder has `fold` on a list chain and `iterate` on a chain. The reference interpreter and the random programs of the test kit have the loops. Tier 2 and the standalone modules compile them to loops with a variable for each name, and a loop that reads no key of the run evaluates once for each run.
- 9987fb6: A `SheetRun` takes the option `compile`, for example `tiered` of `@mark1russell7/vex-compiler` (SHEET.COMPILE). The run evaluates each formula of a column with its compiled program, and the results stay the results of the interpreter. A formula compiles once for each compiler and its options, also across runs. The test kit exports the arbitraries of random sheets: `arbSheet`, `arbTwoTables` and `arbSheetFormula`.
  
  `SheetRun.fill(table)` evaluates each cell of a table in a static order (SHEET.FILL): each column after the columns that it reads, and the keys in the order of its reads from itself. A fill of 20000 rows takes 13 to 26 ms, and the search before took 160 ms. The results of a run are in a map for each column, so the search is faster too. A key of an array space finds its record by its position.
- 2383c3b: Vectors as plain data, for a standalone module. `XYDomain` has the component-wise ops of `Vec2Domain` for `{ x, y }` objects, and each op is a function, so `emitModule` can copy the domain. The op `xy` of `NumDomain` makes a value of it. An op can declare a result of another domain with `returns: "domain:Name"` (KIND.RETURNS): the compiler knows the kind of the result, and the law checker of the test kit checks such a result when its new option `domains` has that domain.

### Patch Changes

- Updated dependencies [344f306]
- Updated dependencies [6a9728e]
- Updated dependencies [e6a565f]
- Updated dependencies [7c2d0c3]
- Updated dependencies [9987fb6]
- Updated dependencies [159c1ab]
- Updated dependencies [124a3d4]
- Updated dependencies [2383c3b]
  - @mark1russell7/vex@0.7.0

## 0.6.0

### Minor Changes

- a6111da: A cell of a sheet can have its own formula (spec SHEET.CELL.FORMULA). That formula replaces the formula of its column at its key, and the other keys keep the formula of the column. `SheetRun` takes the formulas of cells in the option `cells`, and the builder has `sheet().cellFormula(k, column, formula)`. The formula of a cell must give a value of the type of its column. `ReferenceSheetRun` of the testkit takes the formulas of cells too.
  
  In the sheet app, the button **Own formula** gives the selected cell its own formula, and the grid marks that cell. The first month of the loan example has its own formulas, so its columns need no `IFERROR`.
- ae7a253: `space.graph(records, edges)` makes a graph space: records by key, and the edges from each key (spec SPACE.GRAPH). A graph can have cycles. The axes `successors`, `predecessors` and `reachable` follow the edges (spec AXIS.GRAPH), and the builder has `.successors()`, `.predecessors()` and `.reachable()`. In a tree space, the edges go from a parent to its children, so the axes work there too. The arbitraries of the testkit make graph spaces, and the property P16 checks the axes against the edges.
- 01b8d2a: The axis `table(name)` has each key of another table of the evaluation as a target (spec AXIS.TABLE). Its body and its test evaluate in the space of that table, and there the origin is the target, so a value of the first space goes in through a variable. The option `tables` of an evaluation gives the spaces by name, and the builder has `.table(name, body)`.
  
  A `SheetRun` can have more tables (spec SHEET.TABLES): the option `tables` gives each table with its space, its columns and the formulas of its cells, and the option `name` names the main table. `cell`, `warm` and `explain` take the name of a table. One search covers the cells of all the tables, so a cycle across tables gives `#CYCLE!`. The reference interpreter and `ReferenceSheetRun` of the testkit have the tables too, and the properties P8, P15 and the scheduler property compare them with the core.
- ac85b6d: The axis `window(from, to)` has the keys at the offsets from `from` to `to` of the focus, in order (spec AXIS.WINDOW). In a tree space, the offsets go among the siblings. The builder has `.window(from, to, body)`, and the JSON Schema of the IR has the axis. The arbitraries and the builder model of the testkit make windows too, and the property P14 checks the targets.
  
  The formula language writes the axis as `rows(from, to)`, for example `AVERAGE(rows(-2, 0).Sales)` (spec FORMULA.AGGREGATE.WINDOW). The sheet app has a new example, monthly sales, with a moving average, a total for the year and the best month so far.

### Patch Changes

- Updated dependencies [a6111da]
- Updated dependencies [ae7a253]
- Updated dependencies [01b8d2a]
- Updated dependencies [ac85b6d]
  - @mark1russell7/vex@0.6.0

## 0.5.0

### Minor Changes

- 918c6e8: Vex does not depend on the call stack of the engine.
  
  - A `SheetRun` reads its cells from a work list. A chain of 100000 cells, or a tree 100000 levels deep, gives its value in each read order (spec SHEET.DEEP).
  - `isExpr`, `deps` and the new `nestingOf` use a loop with their own stack. An expression can nest `MAX_NESTING` (500) levels deep. A deeper expression gives `#VALUE!` before the evaluation (EVAL.NESTING).
  - A full call stack in host code, for example a recursive op or extension handler, gives the new code `#DEPTH!` with the kind `depth`. `ifError`, a non-strict reduction and `#ARGS` do not hide it (EVAL.DEPTH, V-050). Before, the overflow was `#CALC!`, so `ifError` gave its fallback, and a sheet showed a wrong number.
  - `serialize` and `parse` give `#DEPTH!` for data that is too deep, not an exception.
  - The new helpers `isStackOverflow` and `isDepthError` find the overflow.
  - The testkit exports `ReferenceSheetRun`, the recursive form of the search, as an oracle for the tests of `SheetRun`.

### Patch Changes

- Updated dependencies [918c6e8]
  - @mark1russell7/vex@0.5.0

## 0.4.0

### Minor Changes

- 85849fe: Fix V-043: the moves before an axis are now the address of the axis, so `parent().children(body)` evaluates `body` at each child of the parent. Before, the builder dropped the moves, and the axis started at the origin. The IR node `each` has an optional address `at` (spec AXIS.ADDRESS), `deps` gives the address of each axis, and the test kit generates and checks axes with an address (property P12).
- 5d91ac8: `if(then, otherwise)` on a boolean chain gives the form `if` (spec BUILD.IF). Only the selected branch evaluates. Before, a program had to use `ifError` tricks that also hide real errors.
- 580487f: Fix V-044: a domain value with `toJSON`, for example a `Vec2`, now round-trips through `serialize` and `parse`. Before, `serialize` wrote the `toJSON` form, and `parse` gave a plain object. The test kit adds the builder model test (`arbChain`, `runChain`, `modelChain`), and `referenceEvaluate` takes the free functions (`fns`).
- 2b67de2: Add the WCAG 2.1 ops `relativeLuminance` and `contrast` to `ColorDomain`. The old op `luminance` applies the Rec. 709 weights to the raw channels without the sRGB transfer function, so it does not give the contrast ratios of WCAG. The palette pilot found the gap.
- 41cf9d6: An empty `reduce` gives the identity of the op only when exactly one domain has an identity for it. When more domains have one, the result is `#N/A` with their names, and the new option `reduce(op, { domain })` names the domain to use (V-049, spec LIST.REDUCE.EMPTY). Before, an empty sum of vectors could be the number 0.
- 6a9bdf5: The JSON form of a literal keeps every value. A record with the key `$vex` gets an escape form (V-045, spec IR.JSON.ESCAPE), and `-0`, `NaN` and the infinities get a number form (V-046, spec IR.JSON.NUMBER). A domain value can be in a list or a record of a literal. A file from an older version reads as before.
- c5fb3c5: A list chain has `keys()` and `errors()` (spec BUILD.LIST.KEYS). `keys()` gives the keys of the items with a value, in the order of the axis, and `errors()` gives the error of each item that failed. The IR had both list ops, and the builder now offers them. The Lab reads them too.
- 7aa0e40: A list chain gives its list at an origin with `result`, `at` and `explain` (spec BUILD.LIST.READ). Before, a host evaluated the program of the list chain by hand to read the key of each item.
- c5f39ec: Add `TextDomain`, the domain of texts, with the ops `concat`, `length`, `upper`, `lower`, `trim`, `contains` and `eq`. `concat` joins a text and a value of any kind, like the operator `&` of a spreadsheet.
- 8d22fea: In a tree space, `offset(d)` with one number moves among the siblings in key order (spec NAV.OFFSET.TREE). For example, `offset(-1)` goes to the previous sibling, so a running total works in each group of a tree.

### Patch Changes

- 0badf4c: Fix V-048: a first read of a cell at the end of a long recurrence went deep into the call stack. The overflow became an error value, and `ifError` gave its fallback, so a sheet showed a wrong number without an error. `SheetRun.cell` now evaluates the column in key order up to the key (spec SHEET.RECURRENCE).
- 58f7475: The types of the builder accept each form of a number for a parameter with `liftScalar`: a number, a field with numbers, an argument and a chain. Before, they accepted only a number literal, but the interpreter lifts each form (spec TYPE.LIFT and CALL.LIFT). The flock pilot found the gap: a sum of vectors divided by a count did not compile.
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

## 0.3.0

### Patch Changes

- cb86b41: Add a README to each package (an example that a test checks, the features and the links), and the keywords, homepage, bugs and author fields.
- 07e271e: Add typed free functions: `vex(...).withOptions({ fns })` keeps the types of the functions, and `chain.call(name, ...args)` applies one with typed arguments and a typed result. Add `sheet().declare<T>()`, so a column can read itself or a later column with its type. `NDVector.get` and the test kit have small clean-ups, and every published package has a coverage gate.
- Updated dependencies [cb86b41]
- Updated dependencies [07e271e]
  - @mark1russell7/vex@0.3.0

## 0.2.0

### Minor Changes

- 855fcd5: Publish under the npm names `@mark1russell7/vex`, `@mark1russell7/vex-domains` and `@mark1russell7/vex-testkit`. The type `Optional` is the Optional of the family (`@mark1russell7/optional`); the declarations hold a copy of it, so there is no new runtime dependency.
- 6eff59c: Add sheets (`root.sheet()`, `cell()`, `#CYCLE!` with Tarjan's algorithm), `compile()` (the interpreter is now a closure compiler), `root.ext()`, and the location of extension errors (EVAL.LOCATION).
- c7983f5: Add tree spaces: `space.tree(records, parents)`, the move `parent()`, and the axes `children`, `ancestors`, `descendants` and `siblings`. The test kit generates tree spaces, and property P11 checks the tree axes against the parents.

### Patch Changes

- Updated dependencies [855fcd5]
- Updated dependencies [6eff59c]
- Updated dependencies [c7983f5]
  - @mark1russell7/vex@0.2.0
