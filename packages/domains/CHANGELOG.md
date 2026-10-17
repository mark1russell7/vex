# @mark1russell7/vex-domains

## 0.7.0

### Minor Changes

- e6a565f: The kinds (KIND.PRIMITIVE, KIND.RETURNS, KIND.STATIC). A domain can declare `primitive`, the JavaScript type of its values, and an op can declare `returns`, the kind of its result. The scalar domains declare both, and the law checker of the test kit checks both. `generate` and `tiered` take a `schema` with the kinds of the fields and the variables. An op site whose values have known kinds calls its op with no guard, and a value against the schema goes to tier 1.
- da04054: `NumDomain` has the ops `sin`, `cos`, `asin` and `hypot`. The angles are in radians. A result that is not finite, for example `asin(2)`, gives `#NUM!`. The formula language has them as `SIN`, `COS`, `ASIN` and `HYPOT`.
- 159c1ab: The vectors have ops to make them and to read them. The op `vec2` of `NumDomain` makes a `Vec2` from two numbers: `vec2(x, y)`. The ops `x` and `y` of `Vec2Domain` give the components. `NDVectorDomain` has the component-wise ops `min` and `max`. Thus one expression can calculate a size or a position in two dimensions.
  
  Each op of `Vec2Domain` declares the kinds of its parameters and of its result. The law checker of the test kit checks each declaration, and the compiler knows the kind of each result.
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

- 330f714: `DateDomain` and `LocalDate`: a day of the calendar, without a time and without a time zone. A date plus some days is a date, and a date minus a date is a count of days. The ops are `add`, `subtract`, `addMonths`, `endOfMonth`, `year`, `month`, `day`, `weekday` and the comparisons. The op `date` of `NumDomain` makes a date from a year, a month and a day, and a month or a day outside its range rolls over.
  
  The formula language has `DATE`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `EDATE` and `EOMONTH` (spec FORMULA.DATE). The sheet app has date columns, a CSV import finds them, and a chart can use a column of dates for its horizontal axis. The new example is a list of invoices.
- 0c0d030: `NumDomain` has the ops `ln`, `exp` and `log10`. A result that is not finite, for example `ln(0)`, gives `#NUM!`.
  
  The formula language has the finance functions `PMT`, `FV`, `PV` and `NPER` of a spreadsheet, with its signs (spec FORMULA.FINANCE). Each function compiles to arithmetic, so the steps of a cell show the calculation. The tests compare each function with the examples of the documentation of Excel.

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

### Patch Changes

- Updated dependencies [855fcd5]
- Updated dependencies [6eff59c]
- Updated dependencies [c7983f5]
  - @mark1russell7/vex@0.2.0
