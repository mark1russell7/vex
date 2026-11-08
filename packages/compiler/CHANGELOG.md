# @mark1russell7/vex-compiler

## 0.18.0

### Minor Changes

- 0f69b68: The limit of `iterate` can come from the size of the data. `dataLimit(axis)` gives the number of targets of an axis, and the axis `list` gives the count of a list. The builder also takes a list chain. The interpreter, tier 2 and standalone modules give one value, and a limit that is not valid gives `#NUM!` of the kind `limit`.
  
  A program with a data limit is of step B, so `maxStep: "A"` refuses it. A limit that is a number stays at step A.
  
  The field `limit` of the type of an `iterate` node has a wider type, so code that reads it as a number must change. This is why the version raises MINOR.
- e3e577c: The generated code of `@mark1russell7/vex-compiler` gives the error result of a program itself, with `#ARGS` too. It keeps a small record of each failure, and a materialize step builds the error with the error texts of the core. The core exports these texts as `errorText`, `errorAt` and `noKeyError`. A run that tier 2 ends with an error does not count as a fallback. The tiers give the same results as before. The compile of a program with a chain of functions does not take exponential time in a context that catches an error (V-068).
- f5e4496: A program can calculate a fixed point. The node `fix(name, join, init, step)` makes a column with a value for each row, and `last(name)` reads the last round. The rounds repeat the step until no row changes. The joins `or` and `max` move a row up, and `and` and `min` move a row down.
  
  A check proves that each step moves one way, from the kinds of the ops. A step without a proof gives an error with a reason before a run. The function `monotoneError` gives this reason. An op states its direction in the new field `monotone`, and a function of the host does the same. A column of `n` rows makes `n + 1` rounds at most, and a column that still changes gives `#NUM!`. `explain` shows each round. The testkit has `arbFixExpr` and `arbFixGraph`.
  
  A program with `fix` is of step B, so `maxStep: "A"` refuses it. The interpreter and the reference tier have the construct.
  
  The type `Expr` has two new tags, so a `switch` that covers each tag must change. This is why the version raises MINOR.
- 6aa804b: With `fuse`, a value of `emitModule` that does not depend on the key has one `vex.list` for each run. Each key gets that object, so the object is frozen, with its array of items and its nested lists (COMPILE.MODULE.FUSE.OUT). Each other list of a result is not frozen, as in version 0.17.2 (COMPILE.MODULE.LIST.RESULT). These lists are a value that reads a key, a column of lists of a sheet and each list of a module of `fuse` false.
  
  This is a breaking change before 1.0.0, so it raises MINOR. A host that changes the shared list gets a `TypeError` in strict code, or no change. A host that compares the lists of two keys by identity gets the same object. The values and the errors do not change. A plain array of `lists: "plain"` does not change.
- 46288d2: The bytes of a module do not depend on the runner (COMPILE.MODULE.TEXT). The compiler parses the text of each copied function and prints the tree. Breaking: `emitModule`, `emitSheetModule` and their types move from the root entry to `@mark1russell7/vex-compiler/module`, so a program that only runs tiers does not load the parser.
- 376309a: `emitModule` and `emitSheetModule` refuse a program nested deeper than 500 levels, with the reason of the interpreter (V-088). Before this change, a module of such a program gave a value where the interpreter gives `#VALUE!`. A program of many thousand levels gave a `RangeError`. The published 0.17.2 has both faults. A program that printed a value past the limit gets a refusal at this time, so this change is a break, and it raises MINOR. `@mark1russell7/vex` has the new export `nestingError`.

### Patch Changes

- 94905e8: The printer keeps an alias that a nested block declares again. Before this fix, a fold that stops and has a step at the origin gave `VEX_ERROR` in a standalone module (V-073).
- 1a25b2d: The body of a `let` of an append can read the new list with `get`, or as a list in an argument or a field. A later step can then append to that list. In a module, such a read gave the old items of the list (V-096). The helpers `GT`, `LV` and `LVC` count the items of their cache, so the module gives the values of the interpreter.
- 9f5c982: A module appends in place in two more forms of a step of a loop. A `let` can bind the append to a new name, and the body can read that name and give another list (COMPILE.MODULE.APPEND.LET). A step before the step of the name can read the list with `count`, `nth`, `first` or a fold over the axis `list` (COMPILE.MODULE.APPEND.READ). Before, each such step copied the whole list at each append. The values and the errors stay the values and the errors of the interpreter.
- efd532b: With `fuse`, a step of a loop appends into the array of its name when a branch of the step gives another list (COMPILE.MODULE.APPEND.OTHER). A `let` can bind such a branch, and its body can append to the new name. A step that a later step reads by `count`, `nth`, `first` or a fold over the axis `list` prints after that step (COMPILE.MODULE.APPEND.LATE). Before, each such append copied the list, so n appends cost O(n squared). Such an append makes no array for its right list when a fused loop can push its items (COMPILE.MODULE.APPEND.PUSH). The values and the errors stay the values and the errors of the interpreter.
- a0daad1: Tier 2 gives a list op on an array with the code of the interpreter, so such a run needs no fallback to tier 1. `errors` of an array with a hole stays in tier 1, because its values have the position of the call. `listOps` has the new function `array` (COMPILE.LIST.ARRAY, LIST.OPS).
- 2f69ceb: A print of a module takes less time. The printed text stays the same.
- 4c6ab5c: A module reads each argument of a call in a sum over all the records in the scope of its declaration. Before, such a module threw `ReferenceError` or gave `VEX_ERROR` (V-094, COMPILE.MODULE). A failed property of the testkit gives its error as the cause.
- 925c7e8: Tier 2 gives the result of the interpreter for an empty `reduce` in a context that catches an error. Tier 1 gives the identity of the op, also in `ifError`, in an item of a list op and in a test of `where`. A failed test of a data limit does not hide `#DEPTH!` of a later test (V-071, COMPILE.FALLBACK).
- b74101c: Each published package has the MIT license file in its own folder. Thus npm packs the license with each package. The code does not change.
- 85e2693: V-093: the check of a copy of a function of a domain reads `Infinity`, `-Infinity`, `NaN` and `undefined` inside data. It also reads the items of a `Map` or a `Set`. A module refuses a copy that differs in this way.
- 40508b7: With `fuse`, an `each` over the axis `list` whose body is the name of the item gives the array of its list (COMPILE.MODULE.EACH.SAME). Before, the module copied the list item by item into a new array. The value is not fresh, so no op changes that array in place. The values and the errors stay the values and the errors of the interpreter.
- 73dbd2e: The doc of `emitModule` states that it is a tool of a build. A print of one module of ireko takes 16 to 172 ms on a CI runner, at 0.833 to 1.149 times a fixed base. A caller on a request path keeps the printed module. A limit of the gate holds the cost of today, and the target of 1.10 for each module is not proven.
- f2a119e: Fix: tier 2 gave the value of `ifError` where the interpreter gives `#DEPTH!` (V-066). The same fix covers a list op with a failed check at an earlier item (V-067).
  
  In tier 2, an error of an extension that the program catches stays in tier 2 (COMPILE.EXT). `ifError` gives its second argument, and a list op skips the error item. `#DEPTH!` of an extension still goes to tier 1. An extension in a later argument keeps its `#DEPTH!`, also after an error of an earlier argument.
- ff09d45: A module makes no array for a list of `fill` when only `count` or a loop over the axis `list` reads it (COMPILE.MODULE.FILL.RANGE). This is also true through `take`. The loop goes over the count, which has the checks of `fill` and `take`. Before, the module made an array of pairs only to read its length. The values and the errors stay the values and the errors of the interpreter.
- e6532fa: A chain has the method `fix(name, join, init, step)`. It makes a fixed-point column, as `iterate` makes a loop. The step gets a chain of the last round, so a program of the builder has no read of `last` outside a column. The join gives the kind of the chain, and the core exports the type `FixValue`.
- d430c51: Tier 2 and the standalone modules lower a fixed point. A program with `fix` runs in tier 2 with the result of tier 1. This includes each error value of a row and the failure at the round limit. `emitModule` and `emitSheetModule` make a module of such a program, in place of a refusal.
  
  The core exports `fixRounds`, `fixValueError`, `joinKind` and `worstRow` for the compiler. The testkit has `arbFixProgram`, the generator of the test of the tiers.
  
  A module refuses a column at a key of a literal or of `fill`, because a module has no record at such a key.
- 73bef86: A module prints a `fold` over the targets before the origin as a scan (COMPILE.MODULE.SCAN). The test of such a fold compares a value of the target with a key of the origin by `<` or `<=`. A run evaluates that value once and each step at most once at each record, not at each origin. Thus the angles of the radial module cost O(n log n), not O(n²). The values and the errors do not change.
- a0b7ff0: In a module, a sort in place of 64 items or fewer uses an insertion sort (COMPILE.MODULE.FUSE.SORT). The option `by` of that sort makes no pair for an item. A longer list uses the sort of the engine. The order, the values and the errors do not change.
  
  This change raises PATCH, because it is a backward-compatible feature before 1.0.0. The text of a module changes, but a caller cannot see the change in a result.
- 3a11415: With `fuse: true`, the default, an append of `fill(1, x)` into the array of its loop pushes the item `[0, x]` directly (COMPILE.MODULE.FUSE.ADOPT). It makes no list of `FI` and uses no `AOC`. When a `let` can bind the name to another list, the push has the check `l === w`. When the check fails, `AOC` or `AO` copies the list. The values and the errors do not change. With `fuse: false`, a module prints the code of the version before.
- c06ad31: `emitModule` and `emitSheetModule` have the new option `fuse`, with the default `true` (COMPILE.MODULE.FUSE.OFF). In this version, both values print the same code. The printer also keeps the facts `clean` and `fresh` of each list and the count of the reads of each list node (COMPILE.MODULE.FUSE.FACTS). These facts do not change the printed code. The bench gate has a new case: the shapes module of ireko against its hand code.
- e61208f: With `fuse: true`, the default, a module prints the clean form of a list op where the facts prove the list clean (COMPILE.MODULE.FUSE.CLEAN). The clean form has no scan for error items and no test of the sentinel. The values and the errors do not change. With `fuse: false`, a module prints the code of the version before.
- aa4841d: With `fuse: true`, the default, a module prints `flat` over an `each` as one loop with one output (COMPILE.MODULE.FUSE). The module does not print the list of the `each`. A body of `if` pushes from its branch, and `fill(1, v)` pushes `v`. The values and the errors do not change (COMPILE.MODULE.FUSE.ITEM). With `fuse: false`, a module prints the code of the version before.
- a7bef9e: With `fuse: true`, the default, a module prints a chain of `append` with a part that pushes as one output (COMPILE.MODULE.FUSE). Each part pushes its items in order, with no `concat`. `sortBy` over a clean and fresh list sorts that array in place, in a stable order. The values and the errors do not change (COMPILE.MODULE.FUSE.ITEM). With `fuse: false`, a module prints the code of the version before.
- f888fa8: `fuse: true` is the default. With it, an append into the list of a name of a loop takes a clean and fresh first list as its own array (COMPILE.MODULE.FUSE.ADOPT). Thus the first append makes no copy. An append of the result of the loop pushes into the array of the loop when no other part of the result reads the list. The values and the errors do not change. With `fuse: false`, a module prints the code of the version before.
- f6413f1: `InsetsDomain` keeps the four sides of an inset as plain data, and the op `insets` of `NumDomain` makes a value. A number lifts to four sides, also in a module. A domain can declare `fields`, so two domains of plain objects can share a module.
  
  The new op `insets` of `NumDomain` comes before a host function of that name, so `vex-domains` raises MINOR before 1.0.0. The default list of `vex-mcp` has the new domain, so a record with exactly the four sides goes to it before `NumRecordDomain`. An unclear change counts as breaking, so `vex-mcp` raises MINOR too.
- 53c5a00: With `fuse`, a filter of the list of a loop in a branch of its step works in place (COMPILE.MODULE.APPEND.KEEP). The filter moves the kept items down in the array of the loop, and the next append pushes into that array with no copy. Each other list gets a new array. The values and the errors do not change.
- dc7268e: A print takes less time on a large program. A key reads a shared list of its reads, and the analysis of the memo keeps one record for each node. No printed text changes.
- 67c4191: A column of a call keeps its markers in a second print, so a module has no read of an undeclared name.
- 67c4191: The name test of a printed module misses a TDZ read through a closure, `TypeError`, `RangeError` and wrong values with no exception.
- 67c4191: A compile refuses a program with more places than the limit `COMPILE.PLACES`, and `tiered` runs that program in tier 1.
- 67c4191: A key of a module holds the scope of its names, and one object at two places keeps the value of each place.
- 2a41f1a: A module counts a data limit that reads no key one time for each run. Thus a walk that stops early does not pay for a count at each key. The values and the errors do not change (COMPILE.MODULE.LIMIT.ONCE).
- 0bc2ad8: The new list op `setNth(list, i, value)` gives a list with a new value at one position (LIST.SETNTH). The item keeps its key. The op works in the interpreter, in tier 2 and in a standalone module, and a list chain has `setNth(i, value)`. Its size rule counts the list and the value one time each (LOOP.SIZE.SETNTH).
- 4ab792d: The generated code of `@mark1russell7/vex-compiler` takes `each`, `fold` and a data limit over the axis `list`, also with `reverse`, `where`, an address and `as` (COMPILE.LIST.AXIS). Tier 1 still evaluates that axis over a list with an error item. The core exports `asList`, the list of a value (LIST.ARRAY). The rule is PATCH before 1.0.0: this is a new feature that keeps each result.
- 4c98dff: The generated code of `@mark1russell7/vex-compiler` takes the list ops on list values, list literals and `fill`. A program with `get`, `nth`, `append`, `take`, `sortBy` and the other list ops is in tier 2. It gives the results of the interpreter (COMPILE.LIST.VALUE). The core exports `listOps`, the list ops of `compile` for the values of a host (LIST.OPS). The rule is PATCH before 1.0.0: this is a new feature that keeps each result.
- 747987a: `cell(column, at)` and `r.cell(column, at)` of a sheet take computed moves, so a formula over an array can read the last key. A read with a computed move gives the same result in the interpreter, in tier 2 and in a standalone module. This is also true on a cycle that only the values make (`SHEET.CELL.COMPUTED`, `COMPILE.MODULE.SHEET.COMPUTED`).
  
  A module reads a cell in the expression of a move before a move that can fail, as the interpreter does. Before this change, such a module could miss a cycle.
  
  The random sheets of the test kit have reads at a computed position. Before 1.0.0, a new feature raises PATCH.
- d2cc15b: A name of a loop that starts with the empty list takes the kind of its items from its step in a standalone module (COMPILE.MODULE.LOOP.EMPTY). `sortBy` with the option `by` and the other ops that need this kind print such a program. A program that no step decides keeps its reason. A program with a module today keeps its text.
- b3053fc: The option `faults` of a module selects what a catch does with an exception. With `throw`, a fault of the printed code leaves the run, and an exception of a function of a domain stays an error of Vex. The default `value` prints the same text as before (COMPILE.MODULE.FAULT).
- 1419dbd: `emitModule` and `emitSheetModule` have the option `keys` (COMPILE.MODULE.KEYS). With `keys: true`, a run takes the keys of its records as its last argument. Then `get`, `without`, each `vex.list` and the move `key` use the keys of the host, as the interpreter does. A program that reads no key of a record prints the same text as without the option.
- 104588a: A standalone module takes a list op over an item of a list of lists (V-076, COMPILE.MODULE.LIST.NESTED). A variable of the schema can have a `ListKind` (COMPILE.MODULE.LIST.VAR), for example `{ vars: { froms: { list: "number" } } }`. This change raises PATCH, because the fix and the new optional form are backward compatible, and a package at `0.y.z` raises PATCH for a feature.
- 847a099: `emitModule` and `emitSheetModule` have the new option `lists` (COMPILE.MODULE.LIST.PLAIN). The default `"envelope"` prints the same module as before. With `lists: "plain"`, a list field of the input is an array of the values of its items. The key of an item is the text of its position.
  
  The value of the run and a column of lists give plain arrays. An error item is the `VEX_ERROR` of the module in both directions. A list in a record or in an argument of an op stays a `vex.list`.
- fd057c7: A standalone module gives the error of the interpreter for an op result that is `undefined`, `null` or a number that is not finite. This rule applies to each declaration `returns` (V-070, COMPILE.MODULE.RESULT).
- 044deb9: A standalone module gives the value of the interpreter for a sum in the step of a fold. This covers a sum with an inner fold that has the name of the outer loop (V-077). The fault was on `main` only.
- 70d09bd: A printed function has a parameter only for a level that its body reads, and each call passes only these levels. A scan in the second print of a fold stops that print, and the fold keeps its first print. With `fuse: false`, a dropped print leaves no declaration.
- 1c03956: The module printer gives smaller code with the option `fuse` (COMPILE.MODULE.SIZE). A module has no empty `FI`, no unread key, no alias, no unread helper and fewer lazy cells and ops. The values, the errors and the refusals stay the same. The module of `NODE_SHAPE` has 275 fewer bytes after minify and gzip.
- 0b81634: A module prints a fast loop for a `sum`, a `mean`, a `min` or a `max` over all the records. Its term must read the record only through columns of the run. The body of each call of the term is at the place of the call. Each read of a column reads its pack: an array of the values of the column, which the first such loop of a run makes. One try covers all the items. The values and the errors do not change. The other list ops print the code of the version before.
- a78bf35: A fold with a name of `and(name, ...)` or `or(name, ...)` leaves its loop when each such name stops, and the values and errors do not change. A fold over all the records reads the packs of its columns, so the pair test of the radial pilot is a plain loop.
- 69550b4: A run name hides nothing from the code of a module. In version 0.17.2, a run with `name: "String"` hid the global from the copy of an op. Each key gave `VEX_ERROR`, and the print gave no error. A module whose code has the name prints the run under an internal name, and it exports the run with `as`. The other modules do not change. A global and a declared name of the module are good run names at this time.
- bd4ec21: The kernel exports `readsOf`, `columnOrder`, `isCellRef` and the type `Direction`. `SheetRun` and the module of the compiler use these functions in place of two copies. The results and the errors do not change.
- 54ef960: LOOP.SIZE accepts more steps that do not grow by a factor. A bound is the largest of some sums, so `if` and `ifError` give the larger value (LOOP.SIZE.BRANCH). A fold that copies a list item by item is valid (LOOP.SIZE.COPY). A record from the fields of one item and `take` with a literal limit have the bound of one item (LOOP.SIZE.PART). Each program that the check accepted before stays accepted, and each step that doubles a value stays refused.
- 085754e: The source of tier 2 has no indent, so its size does not grow with the square of the block nesting. A let with no function keeps the map of functions of the lowering. This change does not change the bytes of a printed module (V-089).
- aceaa11: The language has steps A, B and C (STEP.LADDER). The checker gives the lowest step of a program, with the reason (STEP.LOWEST). Each construct is of step A today, so each program is of step A.
  
  The new host option `maxStep` sets the highest step that the host accepts. The default is B. `compile`, tier 2, `emitModule`, `emitSheetModule` and the tools refuse a program above it, and the reason names the needed step (STEP.MAX). `vex_check` gives the step and the reason. `vex_explain` gives the step on the first line. The new exports are `programStep`, `stepError`, `VEX_STEPS`, `VEX_STEP_NAMES`, `CONSTRUCT_STEPS`, `DEFAULT_MAX_STEP` and the types `VexStep`, `StepOptions` and `ProgramStep`.
- 7aac6ae: `TextDomain` has the op `codePoints`: the code points of a text as a list of numbers, in each tier (TEXT.CODEPOINTS). The new kind `list:number` of `returns` declares an op of a domain with a list as its result (KIND.RETURNS.LIST). A module takes that op as a list (COMPILE.MODULE.LIST.OP).
- dbdd73f: The printer changes code only, so a string literal that holds printed code keeps its value in a standalone module (V-079).
- dfaa4e9: A module of a tree space allocates less. A forward loop over `ancestors` walks up the parents with no array. The output array of a run has its length before the first key. The order of a tree uses `Int32Array` and reads only the parents. The values do not change.
- 4816cd6: A printed module reads no undeclared name in a second print (V-081, V-084). A printed function has a parameter only for what its body reads (V-085).
- 5078ec8: A standalone module can hold a program over `Vec2` values (COMPILE.MODULE.FORM). A domain can give a `moduleForm`, the parts that a module copies in place of its own. In a module, a vector is plain `{ x, y }` data, the `toJSON` of a `Vec2`. The interpreter and `tiered` do not change.
- Updated dependencies [1a25b2d]
- Updated dependencies [9f5c982]
- Updated dependencies [efd532b]
- Updated dependencies [a0daad1]
- Updated dependencies [4c6ab5c]
- Updated dependencies [925c7e8]
- Updated dependencies [51d1343]
- Updated dependencies [b74101c]
- Updated dependencies [0f69b68]
- Updated dependencies [40508b7]
- Updated dependencies [e3e577c]
- Updated dependencies [ff09d45]
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
- Updated dependencies [376309a]
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

- dfb4b96: A list op of a module is faster again. In 0.17.1, `V` kept the cache of `VW` on each new list, and the list ops became slower. `V` scans the list and gives it without a copy and without a cache. The values do not change.
- @mark1russell7/vex@0.17.2

## 0.17.1

### Patch Changes

- d21b7f0: A module does not copy a list without error items before a list op reads it (COMPILE.MODULE.LIST.SHARE). `append`, `flat` and `sortBy` read the array of the list. In the shapes module of ireko, these copies were approximately 30 % of the time of a call. The values do not change.
- @mark1russell7/vex@0.17.1

## 0.17.0

### Patch Changes

- Updated dependencies [a4ffc92]
  - @mark1russell7/vex@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [032a9d3]
  - @mark1russell7/vex@0.16.0

## 0.15.0

### Patch Changes

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

- 6a67959: A fold that appends gives a list in linear time (COMPILE.MODULE.APPEND.OWN). In a module of `emitModule`, a step of a name of `fold` or `iterate` can append to the list of the name. When no other part of the loop reads the name, the first append copies the list. Each later append adds its items to that copy. Before, each step copied the whole list, so n appends cost O(n squared). Also, `count` and `first` of a list read the items with values that `nth` keeps (COMPILE.MODULE.NTH.INDEX). The values and the errors stay the values and the errors of the interpreter.
- f3bc451: A standalone module compiles the item names of a list loop (COMPILE.MODULE.LIST.ITEM).
- Updated dependencies [d41464f]
- Updated dependencies [82ecf84]
- Updated dependencies [c304087]
  - @mark1russell7/vex@0.14.0

## 0.13.4

### Patch Changes

- 6b566b2: A standalone module has `fill` when no domain has the op (COMPILE.MODULE.FILL). Its run gives the values and the errors of the interpreter, also for a list of lists. The axis `list` over the keys of a literal or of `fill` gives a reason only when it reads a record at a target.
- 7fb316d: In a module of `emitModule`, an argument of an op after its receiver can be a list (COMPILE.MODULE.LIST.ARG). The op gets a frozen `vex.list`, as in the interpreter. An argument of a call can be a list too. A field of a record can be a list, and the record holds it as a `vex.list` (COMPILE.MODULE.LIST.FIELD). Before, such a program gave the reason "a list is a value of the program". A list as the receiver of an op gives the reason `a list as the receiver of the op "<name>"`, and the list ops `keys`, `values` and `errors` give `the list op "<name>"`.
- 282f3fb: In a module of `emitModule` and `emitSheetModule`, the value of a call can be a list (COMPILE.MODULE.LIST.CALL). A list op, the axis `list`, a fold, a field and an argument of an op take the list of a call. Before, such a program gave the reason "a list is a value of the program". Each kind of the arguments has its own function, with the facts of its list. A list of a call at a place that takes no list still gives that reason. An op of a domain whose value is a list still gives a reason, because the kind of a result cannot tell a list.
- abe3624: In a module of `emitModule`, `nth` keeps the items with values on the array of its list (COMPILE.MODULE.NTH.INDEX). Thus a loop that reads each item of a list with `nth` costs O(n), not O(n squared). The list of a `let` can be a key of a node of the memo. Thus a loop over the records can read that list with `nth`. Before, such a program gave the reason "a list is a value of the program".
- 1403f2b: In a module of `emitModule` and `emitSheetModule`, a field of the schema can have a list kind (COMPILE.MODULE.LIST.INPUT), for example `{ list: "domain:Band" }`. The record holds a `vex.list`, and the program uses the field as a list. The run gives the values of the interpreter. Another value, an item of another kind and an error item of `#DEPTH!` throw a `VexContractError`. The type `Schema` takes such a kind, and `ListKind` moves to `facts.ts`. Before, such a program gave the reason "the kinds of the values of "count" do not decide its op".
- 535409b: `sortBy` has the option `by` (LIST.SORT.BY). `sortBy(list, { by: "from" })` sorts the items by the result of the op `from` on the value of each item. A standalone module has the option too (COMPILE.MODULE.SORT.BY). The catalog of the MCP server tells it.
- Updated dependencies [535409b]
  - @mark1russell7/vex@0.13.4

## 0.13.3

### Patch Changes

- 1fbfe81: A cell of a sheet module can hold a list (COMPILE.MODULE.SHEET.LIST). A later formula reads the list with the list ops, `get`, `indexOf`, the axis `list`, a `let` and the names of a loop. A column of lists that a formula reads before its own formula takes a `ListKind` in the option `kinds`, for example `{ list: "number" }`. The new type `ListKind` is an export.
  
  The value of a program in `emitModule` can be a list too, and `if` and `ifError` take lists as branches (COMPILE.MODULE.LIST.RESULT). The run gives each list as a `vex.list` with the keys as text, and an error item has the error `VEX_ERROR`. A program whose value is a list gave the reason "a list is a value of the program" before, and at this time it gives a module. Thus the tool `vex_module` gives a module for such a program.
  
  The level is PATCH: the change adds a feature and keeps each earlier result. Before 1.0, a backward-compatible feature is a PATCH. The option `kinds` takes more values, and the modules of the earlier programs do not change.
- ba594b7: A sheet module with no search has no function for a column (COMPILE.MODULE.ONCE). The code of each formula is in its loop over the keys, so a run makes no functions and starts none. Columns with the same order of the keys share one loop when each read of an earlier column of the loop reads a finished cell. A run of the measure module of ireko is approximately two times faster, and the module is 61 bytes smaller after minify and gzip.
  
  The level is PATCH: the exported function and its signature do not change, and the results stay the same. Only the text of the module changes.
- @mark1russell7/vex@0.13.3

## 0.13.2

### Patch Changes

- d1a3432: A standalone module takes a graph space (COMPILE.MODULE.GRAPH). With the option `space: "graph"`, the run takes the edges after the variables: for each record, the positions of the ends of its edges. The axes `successors`, `predecessors` and `reachable` give the targets of the interpreter. A module also takes `reduce` with a literal op and the options `strict` and `domain` (COMPILE.MODULE.REDUCE). Thus the force pilot is a module with plain loops.
  
  The tool `vex_module` takes the input `space: "graph"`.
  
  The type of the option `space` of `ModuleOptions` is wider: `"array" | "tree" | "graph"`. The reason for a space that a module does not take changes from `the space "…" is not "array" or "tree"` to `the space "…" is not "array", "tree" or "graph"`. A program with `reduce` or a graph space gave a reason before, and at this time it gives a module.
  
  The level is PATCH: the type of an option is wider, and no export changes its name. Before 1.0, a new feature is a PATCH.
- ea8bfb6: A sheet module fills its cells with no search when each read of a cell reads a finished cell (COMPILE.MODULE.SHEET.DIRECT). Each loop puts the value of a formula into the array of its column. The module is smaller and faster, and its results do not change.
  
  A read of an earlier column reads a finished cell. A read of the same column reads a finished cell in three forms. These are the parent in pre-order, the children in post-order and an earlier key of an array.
  
  The level is PATCH: no exported type changes, and the results stay the same. Before 1.0, a backward-compatible change is a PATCH.
- e63b1d7: A list op on an array in the body of a list op over an axis goes to tier 1 (V-064). Before, the runtime of tier 2 took such a list op as an error item. So `count(each(all, sum(let(b = [], []))))` gave 0 in tier 2, and the interpreter gave the count of the records. The two tiers give the same result again.
  
  The level is PATCH: a bug fix, with no change to an export.
- @mark1russell7/vex@0.13.2

## 0.13.1

### Patch Changes

- caebf7d: A standalone module takes the lists of design E (COMPILE.MODULE.LIST). It has the list ops `drop`, `append`, `without`, `flat`, `get` and `indexOf`. It has list literals, a list op over a `let` and lists as names of `fold` and `iterate`. The module prints plain loops and arrays.
  
  A program with these constructs gave a reason before. At this time it gives a module. The reason `the list op "…" is not in a module yet` is gone. New reasons tell the constructs that a module does not take.
  
  The level is PATCH: no exported type changes. Before 1.0, a new feature is a PATCH.
- @mark1russell7/vex@0.13.1

## 0.13.0

### Patch Changes

- e00a48f: A module of a sheet from `emitSheetModule` gives `VEX_ERROR` for a cell on a cycle when a count reads the cells of the cycle (V-063). Before, a count of all the items, whose body cannot fail, was the count of the records. The module read no cell of its body. Thus a cell that read itself in such a body gave a number, not the result of `SheetRun`.
  
  The level is PATCH: a fix of a wrong result, and no type changes.
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

- 5501948: Four fixes of the compiler:
  
  - A static site of tier 2 whose op gives a value of a domain stays in tier 2 (V-059). An example is the op `xy` of `NumDomain`. Before, each run of such a program went to tier 1.
  - `emitModule` gives a reason for some values of the option `name` (V-060). These values are a reserved word, a name that the module declares and a global that a module reads. Before, such a name gave a module that did not parse, or a run that read its own function in place of a global. Each other name gives a module as before.
  - The check of a result of a domain has a JavaScript name for each name of the domain (V-061). Before, a name with a space, a dot or a parenthesis gave a module that did not parse.
  - Tier 2 and a standalone module keep a field of a record with the name `__proto__` (V-062).
  
  The changes are fixes, and the API does not change, so the change is a patch.
- 2cb5c71: A standalone module takes the formula columns of a sheet (COMPILE.MODULE.SHEET). The new function `emitSheetModule` prints them, and the module gives the results of `SheetRun`. Each cell on a cycle gives `VEX_ERROR`, with the budget of the stack of `SheetRun`.
  
  The level is PATCH: the function `emitSheetModule` and the type `SheetModuleOptions` are new, and no type changes. Before 1.0, a new feature is a PATCH.
- 13b5f9b: A standalone module takes a tree space, the first part of design D of the study of recursion (COMPILE.MODULE.TREE). With the option `space: "tree"` of `emitModule`, the run takes the parents after the variables. Each entry is the position of the parent of its record, or -1 for a root. A parent that is not -1 or a position, or a cycle of parents, throws a `VexContractError`.
  
  The module has the move `parent` and the offsets among the siblings. It also has the window and the axes of a tree and of a graph, in both orders. The run makes only the parts of the tree that the program reads. The tool `vex_module` takes the input `space`.
  
  The type `ModuleOptions` gets the optional field `space`. Without it, a module is for an array space, and its text does not change. No caller needs a change, so the change is a patch before 1.0.
- Updated dependencies [5501948]
  - @mark1russell7/vex@0.11.2

## 0.11.1

### Patch Changes

- dd4d5cb: V-057: the check of an inline form took exponential time for some sources of domain ops. A text of many `!==` and then a quote, for example `(a) => a + "x!==!==!=="` with 40 `!==`, kept `emitModule` busy for hours (CodeQL `js/redos`). A tokenizer takes one token at each step, so the time is linear in the length of the source.
  
  V-058: the old check took `<<=`, `>>=` and `>>>=` as two tokens. So the inline form of `(a) => (a <<= 1)` wrote the field of the record, and the module gave other values than the interpreter. The module keeps the function of such an op, as it does for an op with `+=`.
  
  PATCH: these are fixes, and the API does not change.
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

- Updated dependencies [59ef80d]
- Updated dependencies [394465d]
  - @mark1russell7/vex@0.10.0

## 0.9.1

### Patch Changes

- 53ab73f: A program can be a document of coeval, the language base of the family (decision D12 of coeval). `toDocument` gives the document of an expression, `fromDocument` reads a document back, and `isDocument` tells a document from the tagged IR. Each term is an envelope `{ type, value }`, and a reference is a path from `self` or from `names` (spec §4.1, `DOC.*`).
  
  `compile`, `evaluate`, `explain` and `parse` take a document as well as an expression. `tiered`, `generate` and `emitModule` of the compiler and the tools of `vex-mcp` take a document too. The results for the tagged IR do not change. A document that is not valid gives `#VALUE!` with its reason and its location. The helpers of `@mark1russell7/coeval` are in the build, so `@mark1russell7/vex` has no runtime dependency.
- Updated dependencies [53ab73f]
  - @mark1russell7/vex@0.9.1

## 0.9.0

### Patch Changes

- @mark1russell7/vex@0.9.0

## 0.8.1

### Patch Changes

- 9bad010: In a standalone module, a part of a loop in a loop of a function is a column of the call when it reads a parameter (COMPILE.MODULE). It can also read its target, the origin and the bindings at the root of the body. Each call computes the part once for each target.
- c22cb83: A standalone module computes a call of a function with a costly body once for each record (COMPILE.MODULE). Before, the printer counted a call as one node. Thus the call was not a column of the run, and the module computed the body again at each read. With this fix, the radial module of ireko computes the distance of each pair of neighbors once for each child.
- d654627: In a standalone module, a constant of the run that reads a lazy constant, or calls a function with a loop, is lazy too (COMPILE.MODULE). Before, it evaluated before the run and started that loop, also when the run did not need it.
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
- 6a9728e: Kinds of domains (KIND.DOMAIN): a value of a domain without a primitive type has the kind `domain:Name`. An op with `returns: "domain"` gives this kind, a schema can declare it for a field, and a site on such a value is static. Thus a standalone module can hold the values of a kernel: a domain of plain data, for example a structure that a fold builds. A domain declares `samples`, and a module checks each copy of an op with them. A module checks a field of such a kind with a copy of `is` of the domain.
- e6a565f: The kinds (KIND.PRIMITIVE, KIND.RETURNS, KIND.STATIC). A domain can declare `primitive`, the JavaScript type of its values, and an op can declare `returns`, the kind of its result. The scalar domains declare both, and the law checker of the test kit checks both. `generate` and `tiered` take a `schema` with the kinds of the fields and the variables. An op site whose values have known kinds calls its op with no guard, and a value against the schema goes to tier 1.
- 7c2d0c3: Bounded loops: the expressions `fold` and `iterate` (LOOP.NAMES, FOLD.ORDER, FOLD.ERROR, ITERATE.LIMIT, ITERATE.UNTIL, ITERATE.ERROR). `init` gives the names of a loop and their first values, and `step` gives the next values. A fold makes one step at each target of an axis, in order. An iteration makes up to `limit` steps, a whole number from 0 to 100000, and a true `until` stops it. `result` gives the value. The builder has `fold` on a list chain and `iterate` on a chain. The reference interpreter and the random programs of the test kit have the loops. Tier 2 and the standalone modules compile them to loops with a variable for each name, and a loop that reads no key of the run evaluates once for each run.
- a87c033: `emitModule(expr, options)` prints a program as a standalone ES module with no import of Vex (COMPILE.MODULE). The module checks the schema of its input once. It gives the value of the interpreter at each key, or `VEX_ERROR` for an error of Vex. Each op is the text of the function of its domain, so the results have the same bits as the interpreter. The module has statements and loops. A part that depends on no key evaluates once, and an aggregate by group or by prefix evaluates its items once.
- 124a3d4: The new package `@mark1russell7/vex-compiler` turns a program into JavaScript source. `tiered(expr, options)` gives a program with the interface of `compile`, and its results are the results of the interpreter (COMPILE.TIERED, property P17). The source has the fast path of each op site for the domains of the options. On the programs of the speed lane, the generated code is 1.0 to 1.13 times the hand-written loops, and 70 to 110 times faster than `compile`. Where it cannot give a result, `compile` gives it (COMPILE.FALLBACK). A program keeps the value of each node that depends only on the space, for example the total of a column, so a run at each key of a space costs O(n) (COMPILE.MEMO). A node that reads the origin only through a few values has an entry for each value, so an aggregate by group evaluates once for each group (COMPILE.GROUP).
  
  The core exports `isFieldName`, `safeIs` and `matchesKind` for the compiler. Each space of the core has `records`, the records in the order of the keys (SPACE.RECORDS).

### Patch Changes

- f55e076: Columns of the run in a standalone module. A part of a loop over the targets whose value depends only on the target and on the constants of the run evaluates once for each record, on its first read (helper `Q`). Two parts with the same structure share one column. The full ring of the radial pilot is approximately ten times faster, and its module is smaller.
- c0fda11: A constant of the run with a loop is lazy in a standalone module: it evaluates on its first read, with the helper `L`. Before, a module evaluated each constant before the run, also a loop in a branch that no run takes.
- d376e73: V-051: The address of the axis `all` can fail at some keys. The memo of tier 2 took a list op over such an axis as a value of the space, so tier 2 gave the value of the first key at each key. Now only an address that depends on no key keeps the list op in the memo, and a standalone module evaluates the address too.
- 990a858: V-052: A move from the focus can fail before a fixed key, an index or the origin, for example `[offset(1), key("0")]` at the last key. The memo of tier 2 took such an address as a fixed key, so tier 2 gave the value of another key. A standalone module kept only the code of the last move. Now the address reads its start, and a module keeps the check of each move that can fail.
- 159c1ab: V-053: A node with a tag that the version does not know made `compile` throw a `TypeError`, for example a program with `fold` in 0.6.0. Now `compile`, `evaluate` and a sheet check the shape of the expression first (EVAL.SHAPE). An expression that is not valid gives `#VALUE!` with the reason. The new function `shapeError` gives the reason. The compiler gives the same error through tier 1, and `emitModule` gives the reason.
- 2383c3b: Vectors as plain data, for a standalone module. `XYDomain` has the component-wise ops of `Vec2Domain` for `{ x, y }` objects, and each op is a function, so `emitModule` can copy the domain. The op `xy` of `NumDomain` makes a value of it. An op can declare a result of another domain with `returns: "domain:Name"` (KIND.RETURNS): the compiler knows the kind of the result, and the law checker of the test kit checks such a result when its new option `domains` has that domain.
- Updated dependencies [344f306]
- Updated dependencies [6a9728e]
- Updated dependencies [e6a565f]
- Updated dependencies [7c2d0c3]
- Updated dependencies [9987fb6]
- Updated dependencies [159c1ab]
- Updated dependencies [124a3d4]
- Updated dependencies [2383c3b]
  - @mark1russell7/vex@0.7.0
