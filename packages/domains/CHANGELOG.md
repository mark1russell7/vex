# @mark1russell7/vex-domains

## 0.18.0

### Minor Changes

- 0f69b68: The limit of `iterate` can come from the size of the data. `dataLimit(axis)` gives the number of targets of an axis, and the axis `list` gives the count of a list. The builder also takes a list chain. The interpreter, tier 2 and standalone modules give one value, and a limit that is not valid gives `#NUM!` of the kind `limit`.
  
  A program with a data limit is of step B, so `maxStep: "A"` refuses it. A limit that is a number stays at step A.
  
  The field `limit` of the type of an `iterate` node has a wider type, so code that reads it as a number must change. This is why the version raises MINOR.
- f5e4496: A program can calculate a fixed point. The node `fix(name, join, init, step)` makes a column with a value for each row, and `last(name)` reads the last round. The rounds repeat the step until no row changes. The joins `or` and `max` move a row up, and `and` and `min` move a row down.
  
  A check proves that each step moves one way, from the kinds of the ops. A step without a proof gives an error with a reason before a run. The function `monotoneError` gives this reason. An op states its direction in the new field `monotone`, and a function of the host does the same. A column of `n` rows makes `n + 1` rounds at most, and a column that still changes gives `#NUM!`. `explain` shows each round. The testkit has `arbFixExpr` and `arbFixGraph`.
  
  A program with `fix` is of step B, so `maxStep: "A"` refuses it. The interpreter and the reference tier have the construct.
  
  The type `Expr` has two new tags, so a `switch` that covers each tag must change. This is why the version raises MINOR.
- f6413f1: `InsetsDomain` keeps the four sides of an inset as plain data, and the op `insets` of `NumDomain` makes a value. A number lifts to four sides, also in a module. A domain can declare `fields`, so two domains of plain objects can share a module.
  
  The new op `insets` of `NumDomain` comes before a host function of that name, so `vex-domains` raises MINOR before 1.0.0. The default list of `vex-mcp` has the new domain, so a record with exactly the four sides goes to it before `NumRecordDomain`. An unclear change counts as breaking, so `vex-mcp` raises MINOR too.
- 9613960: `NumDomain` has the op `sign` (NUM.SIGN). `Vec2Domain` and `XYDomain` have the ops `sign` and `minAxis` (VEC2.SIGN, VEC2.MINAXIS and XY.SIGN). A force separation uses them for a push along the smallest axis, with the sign of the gap.
  
  - `sign` gives the value of `Math.sign`, on each component of a vector. `NaN` gives `#NUM!`, and an infinite value gives 1 or -1.
  - `minAxis(v)` gives (1, 0) if `x <= y`, else (0, 1). It compares signed values, a tie gives (1, 0), and a component `NaN` gives `#NUM!`.
  
  The ops of `XYDomain` are functions, so a standalone module can copy them. The ops of `Vec2Domain` are in tier 2, and the class stays out of a module.
  
  The level is MINOR: before 1.0, a breaking change raises MINOR, and an unclear case counts as breaking. The op of a domain comes before a function of the host. Thus a host function `sign` on a number gives way to the op of `NumDomain`. A host function `sign` or `minAxis` on a vector gives way in the same manner.

### Patch Changes

- a0daad1: Tier 2 gives a list op on an array with the code of the interpreter, so such a run needs no fallback to tier 1. `errors` of an array with a hole stays in tier 1, because its values have the position of the call. `listOps` has the new function `array` (COMPILE.LIST.ARRAY, LIST.OPS).
- 925c7e8: Tier 2 gives the result of the interpreter for an empty `reduce` in a context that catches an error. Tier 1 gives the identity of the op, also in `ifError`, in an item of a list op and in a test of `where`. A failed test of a data limit does not hide `#DEPTH!` of a later test (V-071, COMPILE.FALLBACK).
- b74101c: Each published package has the MIT license file in its own folder. Thus npm packs the license with each package. The code does not change.
- e6532fa: A chain has the method `fix(name, join, init, step)`. It makes a fixed-point column, as `iterate` makes a loop. The step gets a chain of the last round, so a program of the builder has no read of `last` outside a column. The join gives the kind of the chain, and the core exports the type `FixValue`.
- d430c51: Tier 2 and the standalone modules lower a fixed point. A program with `fix` runs in tier 2 with the result of tier 1. This includes each error value of a row and the failure at the round limit. `emitModule` and `emitSheetModule` make a module of such a program, in place of a refusal.
  
  The core exports `fixRounds`, `fixValueError`, `joinKind` and `worstRow` for the compiler. The testkit has `arbFixProgram`, the generator of the test of the tiers.
  
  A module refuses a column at a key of a literal or of `fill`, because a module has no record at such a key.
- 2a41f1a: A module counts a data limit that reads no key one time for each run. Thus a walk that stops early does not pay for a count at each key. The values and the errors do not change (COMPILE.MODULE.LIMIT.ONCE).
- 0bc2ad8: The new list op `setNth(list, i, value)` gives a list with a new value at one position (LIST.SETNTH). The item keeps its key. The op works in the interpreter, in tier 2 and in a standalone module, and a list chain has `setNth(i, value)`. Its size rule counts the list and the value one time each (LOOP.SIZE.SETNTH).
- fd057c7: A standalone module gives the error of the interpreter for an op result that is `undefined`, `null` or a number that is not finite. This rule applies to each declaration `returns` (V-070, COMPILE.MODULE.RESULT). Version 0.17.2 gives a value in these cases, and the interpreter gives an error. A project on 0.17.2 with a module of an op that can give such a result has wrong values. Print the module again with this version.
- 54ef960: LOOP.SIZE accepts more steps that do not grow by a factor. A bound is the largest of some sums, so `if` and `ifError` give the larger value (LOOP.SIZE.BRANCH). A fold that copies a list item by item is valid (LOOP.SIZE.COPY). A record from the fields of one item and `take` with a literal limit have the bound of one item (LOOP.SIZE.PART). Each program that the check accepted before stays accepted, and each step that doubles a value stays refused.
- 7aac6ae: `TextDomain` has the op `codePoints`: the code points of a text as a list of numbers, in each tier (TEXT.CODEPOINTS). The new kind `list:number` of `returns` declares an op of a domain with a list as its result (KIND.RETURNS.LIST). A module takes that op as a list (COMPILE.MODULE.LIST.OP).
- 5078ec8: A standalone module can hold a program over `Vec2` values (COMPILE.MODULE.FORM). A domain can give a `moduleForm`, the parts that a module copies in place of its own. In a module, a vector is plain `{ x, y }` data, the `toJSON` of a `Vec2`. The interpreter and `tiered` do not change.
- Updated dependencies [a0daad1]
- Updated dependencies [925c7e8]
- Updated dependencies [51d1343]
- Updated dependencies [b74101c]
- Updated dependencies [0f69b68]
- Updated dependencies [e3e577c]
- Updated dependencies [e6532fa]
- Updated dependencies [d430c51]
- Updated dependencies [f5e4496]
- Updated dependencies [74f129f]
- Updated dependencies [f6413f1]
- Updated dependencies [2a41f1a]
- Updated dependencies [0bc2ad8]
- Updated dependencies [4ab792d]
- Updated dependencies [4c98dff]
- Updated dependencies [747987a]
- Updated dependencies [fd057c7]
- Updated dependencies [968b9a5]
- Updated dependencies [1d3b047]
- Updated dependencies [bd4ec21]
- Updated dependencies [54ef960]
- Updated dependencies [49c267e]
- Updated dependencies [aceaa11]
- Updated dependencies [7aac6ae]
- Updated dependencies [5078ec8]
  - @mark1russell7/vex@0.18.0

## 0.17.2

### Patch Changes

- @mark1russell7/vex@0.17.2

## 0.17.1

### Patch Changes

- @mark1russell7/vex@0.17.1

## 0.17.0

### Patch Changes

- 5394da6: `@mark1russell7/vex-domains` exports the schema program of JSON documents (EXAMPLE.SCHEMA): `SCHEMA_PROGRAM`, `SCHEMA_DOMAINS`, the function `schemaOf(docs)` and the type `JsonFieldSchema`.
- Updated dependencies [a4ffc92]
  - @mark1russell7/vex@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [032a9d3]
  - @mark1russell7/vex@0.16.0

## 0.15.0

### Patch Changes

- be7202e: `JsonDomain` has the op `leaves(o, depth)` (JSON.LEAVES). It gives the leaves of the object `o` as an array of records `{ path, kind, value }`, in the order of a walk. The walk goes into an object with fields while the path has fewer than `depth` keys. The paths join the keys with `.`. Thus a schema walk is one op, and the list ops read its result. The function reads no name outside itself, so a standalone module can copy it.
  
  The catalog of `@mark1russell7/vex-mcp` has the row of `leaves`.
  
  The level is PATCH, as the brief of the op asks. The new op adds a name to the domain, and no op of the domain changes.
- Updated dependencies [0e25e96]
- Updated dependencies [320b3f5]
  - @mark1russell7/vex@0.15.0

## 0.14.0

### Breaking Changes

- The runtime dependency `@mark1russell7/coeval` changes from `^0.8.0` to `^0.9.0`. In coeval 0.9.0, equal profiles share one frozen formula kit (K41). Do these steps:
  - An app that uses only Vex needs no change. Change its range of each package of the group to `^0.14.0`, because `^0.13.0` does not include 0.14.0.
  - An app that also imports coeval, for example to give `VEX_WORLD` or `toKernelError` to its own kernel, changes its range of coeval to `^0.9.0`. Else the app gets two copies of coeval, and their types do not agree.
  - An app that changes an evaluator of the formula kit of coeval after it gets it must not do that now. The evaluators are frozen. Make a new profile.
  - 0.14.0 replaces the planned 0.13.5. No 0.13.5 was released.

### Patch Changes

- 6e06bd7: A JSON domain reads the kinds and fields of a JSON value (JSON.KIND, JSON.FIELD). `JsonDomain` has the ops `kind`, `kinds`, `fields` and `field`. Put it last in the list of domains. The catalog of the MCP server lists it.
- Updated dependencies [d41464f]
- Updated dependencies [82ecf84]
- Updated dependencies [c304087]
  - @mark1russell7/vex@0.14.0

## 0.13.4

### Patch Changes

- Updated dependencies [535409b]
  - @mark1russell7/vex@0.13.4

## 0.13.3

### Patch Changes

- @mark1russell7/vex@0.13.3

## 0.13.2

### Patch Changes

- @mark1russell7/vex@0.13.2

## 0.13.1

### Patch Changes

- @mark1russell7/vex@0.13.1

## 0.13.0

### Patch Changes

- @mark1russell7/vex@0.13.0

## 0.12.0

### Patch Changes

- f6c55b3: `Vec2Domain` has four ops for a main axis and a cross axis (VEC2.ALONG, VEC2.COMPOSE and VEC2.SELECT). Thus one program serves the two directions of a stack, a span or a row of keys and values.
  
  - `along(v, dir)` gives `dot(v, dir)`, the component along the unit axis `dir`.
  - `across(v, dir)` gives `dot(v, swap(dir))`, the component on the other axis.
  - `compose(dir, main, cross)` gives `dir * main + swap(dir) * cross`.
  - `select(mask, a, b)` gives the component of `a` where the mask is not 0, else the component of `b`. A number argument lifts to a vector.
  
  A component of a `Vec2` stays finite (VEC2.FINITE), so each result of a program before this change stays the same. An open bound uses `select` with `max` or `min`, not an infinite bound.
  
  The level is PATCH: the ops are new, and no op or type changes. Before 1.0, a new feature is a PATCH.
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

### Patch Changes

- Updated dependencies [52c1e27]
- Updated dependencies [9918bfb]
  - @mark1russell7/vex@0.11.0

## 0.10.0

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

### Patch Changes

- Updated dependencies [431bea0]
- Updated dependencies [f85789c]
- Updated dependencies [1520434]
  - @mark1russell7/vex@0.8.0

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
