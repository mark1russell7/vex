# The Vex compiler: architecture and plan

*Written: 2026-10-13. Status: accepted, phase C1 done. §11 gives the decisions of the owner, and §13 gives the record.*

## 1. The idea

An interpreter and a compiler apply the same semantics at different times. `evaluate` applies them at the time of the run and gives values. A compiler applies them before the run and gives code. Thus a compiler is the interpreter, specialized to one program.

Vex already has many functions over one IR: `evaluate`, `explain`, `deps`, `serialize` and `toVexChain`. The compiler is one more of these functions, and its output is code. The interpreter stays the reference of the semantics. The compiler is correct when it gives the result of the interpreter for each program.

The reason is speed. The closure compiler of today (`compile`) is 17 to 78 times slower than hand-written loops. The time goes into result objects, the search for the domain of each value, the check of each argument, and a list for each axis.

A spike on the program "the nearest other box" (60 boxes) measured this:

| Path | Time of one run | Ratio to the loops |
|---|---|---|
| Hand-written loops | 87.7 µs | 1 |
| The closure compiler of today | 6831 µs | 78 |
| Generated code that calls the ops directly | 87.7 µs | 1.00 |
| Generated code with the arithmetic in local numbers | 49.5 µs | 0.56 |

Generated code is as fast as the loops, or faster, because it makes no objects.

The main user is ireko: its layout strategies become Vex programs, and its build compiles them to plain JavaScript (§6).

## 2. The architecture

```
front ends: the builder, the formulas, the text language, JSON
   ↓
the Vex IR (the semantics; the interpreter is the reference)
   ↓ analysis: the kind of each value, what depends on the origin, the cost
the typed IR (each op resolved to its domain)
   ↓ lowering: an axis becomes a loop, a reduction becomes a running value
the loop IR (with checks that send an evaluation back to the interpreter)
   ↓ back ends
   ├─ JavaScript closures: the compile of today, without eval, on each page
   ├─ JavaScript source: at run time with `new Function`, or at build time as a module
   └─ later: shaders for large grids, SQL for sheets in a database
```

Each stage is a function of the stage before it. A back end reads only the loop IR, so a new back end needs no change of the analysis or of the lowering.

### 2.1 The tiers

At run time, a program operates in one of three tiers:

| Tier | What | Where |
|---|---|---|
| 0 | The interpreter | Each page. Only this tier gives a trace (`explain`). |
| 1 | The closure compiler (`compile` of today) | Each page, also a page that does not permit `eval` |
| 2 | Generated JavaScript | A page that permits `new Function`, and each build |

A tier-2 program is specialized to the kinds of values that it expects. A check that fails sends that one evaluation to tier 1, so the result is the result of the interpreter (§4.1).

A build is tier 2 with declared kinds in place of observed kinds. Thus the run-time compiler and the build-time compiler are one design.

## 3. The stages

### 3.1 The Vex IR

The IR does not change for the compiler. The front ends, the spec and the interpreter stay as they are. A construct that the compiler does not know makes the program run in tier 1.

### 3.2 Analysis: the typed IR

The IR has no types. The analysis gives each node a **kind**:

- `number`, `boolean`, `string`
- `domain(D)`: a value whose first accepting domain is `D`, for example `domain(Vec2)`
- `list(K)`: the list of an axis, with items of the kind `K`
- `record(fields)`: a record with a kind for each field
- `unknown`: a value of any kind

The kinds come from three sources:

1. A **schema** of the records of the space, with a kind for each field. The formula language and ireko know their schemas.
2. Declared kinds of variables.
3. **Observed** kinds: at run time, a program can start in tier 1 and record the kinds of its values. Then tier 2 compiles for those kinds.

The analysis resolves each op with the rule of the interpreter. The op belongs to the first domain that accepts the receiver and has the op, and else to a free function. An op spec can give the kind of its result in a new optional field `returns`. Without `returns`, the result has the kind `unknown`. A node of the kind `unknown` uses the dispatch of the interpreter at run time, so it is correct but slower.

The analysis also finds the nodes that do not depend on the origin (§7.2), and it estimates the cost of each node.

Phase C1 has no static kinds. Each op site of the runtime keeps the facts of its last receiver instead (§13). The kinds and `returns` move to phase C2.

### 3.3 Lowering: the loop IR

The loop IR is a small language of statements:

- locals, and assignments to locals
- a loop over the targets of an axis, in the order of the axis
- a running value for a reduction: a count, a sum, a minimum
- a direct call of an op function, or a primitive operation on numbers
- a read of a field of a record, by the index of a constant
- a check, with the reason that it fails
- a return

The lowering joins an axis and its reduction into one loop, so it makes no list. A list exists only when the program gives a list. A move of an address becomes a call of a space function of the core (`applyMove`, `axisTargets`). In an array space or a grid, it becomes a computed index.

### 3.4 The back ends

- **JavaScript closures.** Tier 1 stays the `compile` of today. It does not read the loop IR at first. Later, a closure back end of the loop IR can replace it.
- **JavaScript source.** A printer gives the source of a function from the loop IR. At run time, `new Function` makes the function. At build time, the source goes into an ES module (§6).
- **Later back ends.** A shader back end for large grids (the Game of Life on a GPU), and an SQL back end for sheets over a database.

## 4. Exact semantics

### 4.1 Checks and the fallback

The generated code expects the usual case: each field exists, each value has its expected kind, each number is finite, and no op fails. A check guards each of these facts. When a check fails, the generated function stops and gives the value `FALLBACK`. Then the same evaluation runs again in tier 1, and its result is the result.

Thus generated code does not make an error value. Each error of Vex (`#REF!`, `#N/A`, `#NUM!` and the others) comes from the interpreter, with its message, its path and its location.

A failed check stops the program only where the error is the result. In three contexts, the error is not the result:

- In an item of a list op, the error makes an error item. The list op skips it, and with the option `strict`, the list op fails.
- In the first argument of `ifError`, the error gives the second argument.
- In a binding of `let`, the error is an error only where the body reads the name. A flag tells each read.

An exception in an op is the error `#CALC!` of that op, so it follows the same rules. A full call stack (`#DEPTH!`) always stops the program, because no list op and no `ifError` hides it.

### 4.2 The same bits

A result of tier 2 must have the same bits as the result of the interpreter. ireko compares its layouts byte for byte.

A copy of the arithmetic of an op can change the bits. For example, the length of a vector is `Math.hypot(x, y)`. The spike used `Math.sqrt(x * x + y * y)`. These two differ for 38 % of random vectors.

Thus phase 1 calls the op functions themselves, and copies no arithmetic. Phase 2 inlines arithmetic only from one source: each inline form and its op function come from the same definition (§7.1).

### 4.3 Traces

Generated code makes no trace. `explain` always operates in tier 0, so the question "why is this box here" always has an answer.

### 4.4 Standalone modules

A module of the build can operate without the interpreter. Then a failed check throws a `VexContractError` that names the check, because no fallback exists.

A host that guarantees the kinds of its input uses standalone modules. ireko gives its strategies only finite numbers and plain rectangles. Thus ireko uses them. A module with the fallback imports the interpreter.

## 5. Safety of generated code

A formula of a user goes into generated code. A name that goes into the code as text can become code. Thus:

- The generated code reads each name and each literal from a list of constants, by its index. No name or literal goes into the source as text.
- The same IR and the same options always give the same source. A module of the build is stable, and its diff is easy to examine.
- A page that does not permit `new Function` operates in tier 1. The result is the same, and only the speed changes.

## 6. Compile at build time: ireko

ireko is a layout engine with a size budget of 15 kB gzip, no runtime dependencies, and output that is the same byte for byte. Its strategies become Vex programs. Its build compiles each program into a standalone module (§4.4), and the published package contains only the generated code. Thus:

- ireko has no runtime dependency on Vex, and its size stays in the budget.
- The speed is the speed of hand-written loops.
- Vex is the source of the strategies: their spec, their tests and their traces.

A property test of ireko compares each generated strategy with the interpreter on random trees. The golden SVG files of ireko do not change.

## 7. Speed after phase 1

### 7.1 Arithmetic in locals

A domain can give an **inline form** for an op: the arithmetic on the components of its values. Then a vector lives in two local numbers, and the code makes no object. The inline form and the op function come from one definition, so they have the same bits.

### 7.2 Work that does not depend on the origin

`AVERAGE(all.Score)` is the same at each row. The interpreter computes it at each row, so the cost is O(n²). A program keeps the value of such a node for each space. Thus a run at each row computes it once, and the cost is O(n) (§13.2).

### 7.3 Aggregates by group

"The width of a column is the largest width in the same column" is a group. The node reads the origin only through its column, so its column is the key of the memo. Thus the node evaluates once for each column, not once for each row (§13.2).

### 7.4 Sheets

A sheet whose cell references have fixed addresses has a fixed order of evaluation. The compiler gives straight-line code in that order, like the calculation chain of a spreadsheet. A recurrence over `row(-1)` becomes one forward loop.

The first form of this is done (§13.2). `SheetRun.fill` evaluates the cells in a static order, and each cell reference finds a finished cell. Generated code that reads the cells without the extension is a later step.

### 7.5 Recalculation

A run knows which cell reads which cell. After a change of one record, only the cells that depend on it change. This is for the live editor of ireko and for the drag of a box in Graph.

## 8. Bounded iteration

Vex has no loop, so each program ends. The language keeps this property, and it gets **bounded** iteration:

- `fold(axis, init, step)`: a reduction in the order of the axis, with an accumulator in an expression.
- `iterate(n, init, step)`: `n` steps of an expression. A fixed point stops at a stable value or at a limit.
- **Domain kernels**: ops of a domain for the algorithms of data structures. Vex composes them.

These give the strategies of ireko that are not formulas today:

| ireko | In Vex |
|---|---|
| `tree`, the tidy tree | A `fold` over the siblings: `contour.merge(child.contour.shift(offset))`, with a contour domain |
| `layers`, the layers | The layer of a node is a recurrence over its predecessors, with a graph space and a sheet. The order of a layer is `iterate(8, ...)`. |
| `avoid`, the router | An op of a routing domain |

Each new construct goes through each stage. The stages are the interpreter, `explain`, `deps`, JSON, the builder, the formulas, the reference interpreter of the test kit and the compiler.

### 8.1 The design of `fold` and `iterate`

Each construct is a new kind of expression. It binds names for its steps, as `let` binds names for its body.

| Kind | JSON | Children, in order |
|---|---|---|
| `fold` | `{ "tag": "fold", "axis", "init", "step", "result", "at"? }` | the values of `init`, the values of `step`, the tests of `where`, the expressions of the address, `result` |
| `iterate` | `{ "tag": "iterate", "limit", "init", "step", "until"?, "result" }` | the values of `init`, the values of `step`, `until`, `result` |

`init` is a record of names and expressions: the names of the loop and their first values. `step` is a record of some of these names and an expression for the next value of each. Each step evaluates all its expressions with the values before the step, and then all the names get their new values. A name without a step keeps its value. `result` evaluates at the node with the last values, and it gives the value of the construct.

A value of a loop is a value of a name, not a field of a record. Thus a bisection holds two numbers, `lo` and `hi`, and the compiler holds each name in a local variable, as a loop of ireko does.

A fold evaluates `init` at the node. Then it evaluates `step` at each target of the axis, in the order of the axis. The focus of a step is the target. A target that a test of `where` removes has no step. The first error of a value, of a test or of `result` is the value of the fold.

An iteration evaluates `init` at the node, and then `step` up to `limit` times, at the same position. `limit` is a whole number from 0 to 100000 in the expression, not a value of a run. Thus each program ends.

Without `until`, the iteration makes `limit` steps. With `until`, the test evaluates before each step and after the last one. A true test stops the iteration, and with no true test the value is `#NUM!`. The first error of a value, of the test or of `result` is the value of the iteration.

A step is a function of the values before it. Thus a step that gives the same values again gives them at each later step, and an implementation can stop there.

These constructs give the full ring of `radial`. The code of ireko adds the angles one after another, so a fold gives the same bits. It finds the radius with a loop that doubles it until a test is true, and then with 50 steps of a bisection. These are an iteration with `until`, and an iteration with the limit 50.

Each stage has the loops. The formulas have `ITERATE(limit, name, first, step, ..., result, UNTIL test)` and `FOLD(axis WHERE test, name, first, step, ..., result)` (FORMULA.ITERATE, FORMULA.FOLD), and the Vex view of a formula shows them as calls of the builder. Tier 2 has a local for each name and a labeled loop. A new value of another kind stops the program, and tier 1 evaluates it. A module has a `let` for each name and a `for` loop. Each name has a level of its own, so a part of a step that reads a name stays in the loop. A loop that reads no key of the run is a constant of the run. Thus the bisection of a ring evaluates once for each run, not once for each child.

### 8.2 The design of domain kernels

A kernel is a domain whose values are data structures. Two examples are the bands of the shape of a subtree and the index of a sweep over boxes. Its ops run the algorithms. A value of a kernel does not change: an op gives a new value. Vex composes the ops: a fold builds a structure, and an op reads it.

- **Kinds.** A value of a domain without a primitive type has the kind `domain:Name`. An op with `returns: "domain"` gives this kind, and a parameter `domain` takes it. Thus a site on such a value is static (KIND.STATIC) when each domain before its domain has a primitive type.
- **Modules.** A module copies the function of each kernel op, as for each other op. A kernel domain gives `samples`: values for the check of each copy. An op that reads a name outside itself gives a reason, not code.
- **Schema.** A field of the records can have the kind of a domain. The module checks it with the copy of `is` of the domain.
- **Scans.** A fold over the keys before the origin evaluates at each origin again, so a run costs O(n²). A scan gives each prefix in one pass, so the run costs O(n). The angles of `radial` and the packing of `tree` are such folds.

The first kernels are the bands of ireko for `tree`, and a sweep over boxes for the check `OVERLAP`.

The kinds of domains are done (KIND.DOMAIN): a module holds the values of a kernel, also through a fold. Three needs of the kernels are decisions of the owner:

- **Functions.** Vex has no functions, so the test of a radius of `radial` is in the program four times. Its module is 2.6 kB, and the code of ireko is 1.1 kB.
- **Lists as values.** A test of a radius needs the angle of each child. Without a list, a fold over the pairs computes each angle again for each pair. The sweep of `OVERLAP` also needs all the boxes as one value.
- **The reverse order.** The strategy `tree` packs the row from the last child to the first, too. An axis of Vex has one order, so that packing is not a fold.

### 8.3 Proposals for the three needs

Each proposal keeps the programs total: each evaluation ends, and it gives a value or an error value. The owner decides each one.

| Need | Proposal | Size | It unblocks |
|---|---|---|---|
| Functions | A `let` binds a function: the new node `fn` with names of parameters and a body. The new node `call` applies a bound function to arguments. A function cannot call itself, so each call ends. `deps` reads the body with the arguments. A module prints one JavaScript function, and tier 2 puts the body at each call. | Large | The radial module prints its test of a radius once, so it gets smaller than 2.6 kB. |
| Lists as values | A `let` binds a list of `each`, and the new axis `axes.list(v(name))` has the items of that list as targets, in their order. The list ops `sortBy`, `take` and `at` give new lists. A module keeps a list as an array. | Large | The sweep of `OVERLAP`: the boxes in one sorted list. The angles of the children once for each node. |
| The reverse order | The new axis `axes.reverse(axis)` has the targets of an axis in the reverse order. A fold over it starts at the last target. A module prints a loop from the end. | Small | The packing of `tree` from the last child. |

The recommended order is the reverse axis first, because it is small. Then the functions, because the module of each strategy gets smaller. Then the lists, because only `OVERLAP` and the angles need them.

The status on 2026-10-17:

- The reverse axis is done (AXIS.REVERSE). A module prints a loop from the end.
- Functions are done in the interpreter, in `deps`, in tier 2 and in a module (FN.BIND, FN.CALL, FN.TOTAL, FN.ARGS and FN.VALUE). Tier 2 puts the body at each call. A module prints one JavaScript function for each function and each set of kinds of its arguments. With functions, the radial module went from 2940 B to 1960 B of minified gzip.
- Lists as values are done in the interpreter (LIST.VALUE, AXIS.LIST, LIST.SORT, LIST.TAKE and LIST.NTH). The op of the proposal `at` has the name `nth`, because the builder has the method `at(key)`. Tier 2 gives a reason for a program with lists, and tier 1 evaluates it. A module keeps each list as an array of pairs of a key and a value, and an error item holds the error sentinel. A list of the run, for example the sorted boxes, evaluates once for each run. A list is a value only in a binding, as the head of a list op and as the list of the axis list.

Tier 2 puts the bodies of functions in at most 10000 places in one program (`MAX_CALLS`). A function that calls another function twice doubles its body. Thus a chain of 15 such functions puts the first body in 16384 places. Over the limit, tier 1 evaluates the program. A module prints each function once, so it has no limit.

The printed functions of a module:

- A parameter can hold the error of its argument, as a name of a let can. A read of it checks for the error. Thus one function serves each call with arguments of the same kinds.
- The function takes the focus and the origin of the call only if its body reads them.
- A function that reads a name of the place of its binding is at that place in the code. Each other function is at the start of a run, so a constant of the run and a column of the run can call it.
- A key of a constant of the run has the number of the binding of each function that it calls. Before, two functions with one name made two calls with the same text. The calls shared one constant, and the second call gave the value of the first.

### 8.4 Recursion: open

A function cannot call itself (FN.TOTAL). Thus each call ends, and each program stays total. This section gives the first options for a function that calls itself. The owner keeps the decision for later. The three options below are possibly not the only ones, and the cost of each option in the compiler needs a study first.

The current language already has two forms of recursion:

| Recursion | The form of Vex | Why it ends |
|---|---|---|
| A loop: a function that calls itself as its last step | `iterate` with a limit and `until` | The limit. At the limit, a test `until` that is not true gives `#NUM!`. |
| A calculation over the levels of a tree: the size of a node from the sizes of its children | A sheet: a formula column that reads the same column at the children | A tree is finite, and a cycle of cells gives `#CYCLE!`. |

The options for more:

| Option | The design | Cost | Risk |
|---|---|---|---|
| A. No recursion | Keep FN.TOTAL. The docs show the translation to `iterate` and to a sheet. | None | A calculation that needs a stack has no form, for example a walk of a nested value. |
| B. Recursion with a depth limit | The new node `letrec` binds functions that see each other. Each call counts a depth, and a depth over a limit gives `#NUM!`, as `iterate` does. | Medium. Tier 2 cannot put the body at each call, so it needs real functions with a counter, as a module has. | A limit in the program is a number that the author must choose. A deep tree gives `#NUM!`, not a value. |
| C. Recursion over the structure | A function can call itself only at a key of an axis that goes down: `children` or `descendants` of a tree. The call moves the focus to the child. | Large. It needs a check that each recursive call goes down. | A graph has no direction that always goes down, so a graph needs `#CYCLE!` as a sheet does. |

The first recommendation was A at this time, and C only when a program of ireko needs it. The strategies of ireko calculate one container from its children, and the engine of ireko walks the tree. Thus no strategy needs recursion. Option C keeps the idea of Vex: a value at a position from the values at other positions. Option B adds a limit that the data does not decide.

## 9. Packages

- `@mark1russell7/vex-compiler` is a new published package. It has the analysis, the lowering, the back end of JavaScript source, the tiers, and `emitModule` for builds. The core stays small, because a page that does not compile does not load the compiler.
- The core gets the optional field `returns` of an op spec. It also exports the functions that generated code calls: the space functions and the dispatch of an op.
- The API of the compiler:

| Function | What it does |
|---|---|
| `generate(expr, options)` | The loop IR and the JavaScript source of a program, with its constants. The source is for the domains of the options. It is pure, so a build can use it. |
| `load(generated)` | A program of tier 2, made with `new Function`, for the options of the source |
| `tiered(expr, options)` | Tier 2 when it can, and else tier 1. After a failed check, tier 1 does that evaluation again. |
| `emitModule(programs, options)` | An ES module for a build, standalone or with the fallback. It comes in phase C3. |

Each program has the `Program` interface of the core (`run`, `explain`), so each tier can replace another tier.

## 10. Tests

- **Property P17**: on random programs and random spaces, `tiered` gives the result of the interpreter. The test also reports the share of programs in tier 2, so a fallback cannot hide a gap.
- **Golden files** of the generated source for fixed programs. A change of the generated code shows in the diff.
- **The speed gate** of the nightly workflow: generated code against the hand-written loops for the programs of the speed lane, with no fallback. In phase C1, each limit is approximately twice the measured ratio. Phase C2 sets the limit 1.2.
- **Standalone modules**: a test imports a generated module and compares it with the interpreter.
- The mutation lane covers the compiler package at 95 % or more.

## 11. Decisions of the owner

The owner made these decisions on 2026-10-13:

1. The compiler is a new stage after the IR (option 2). The interpreter stays as it is, and properties prove that the compiler gives its results.
2. The architecture has the stages of §2 and the tiers of §2.1. The build and the run time use one compiler.
3. Vex is the source of the strategies of ireko, compiled at the build of ireko.
4. Vex has only bounded iteration (§8), so each program ends.

The owner made these decisions on 2026-10-16:

5. The moves `key` and `index` take an expression (NAV.COMPUTED). Thus `deps` knows only that such a read goes to some key.
6. The size budget of the core of ireko can go up for the generated strategies.
7. Phase C4 comes after the computed moves.

## 12. Roadmap

| Phase | Deliverables | Done when |
|---|---|---|
| C1 The compiler | The package, the loop IR, the back end of JavaScript source, `tiered`, the checks and the fallback, P17, golden files, the speed gate | Done on 2026-10-13 (§13). P17 passes, and the speed lane is 2.3 and 1.6 times the loops. |
| C2 Speed | The fast path of each op site in the source, the records of a space by index (SPACE.RECORDS), the memo of work that does not depend on the origin (COMPILE.MEMO), aggregates by group (COMPILE.GROUP), sheets with fixed addresses | The speed lane is within 1.2 times the loops. A run at each key costs O(n) for work that does not depend on the origin, and O(n times the groups) for an aggregate by group. These are done (§13.2), also the compiled formulas of a sheet run and the static order of its cells. |
| C3 ireko | The kinds (§3.2) and `returns` on the ops of the built-in domains, then the inline forms (§7.1), `grid` as a Vex program, standalone modules in the build of ireko, then the closed form of `radial` and the audits | The golden files of ireko do not change, and its benchmarks hold |
| C4 Iteration | `fold`, `iterate`, domain kernels, then `tree` and `layers` of ireko | Each construct passes each stage, and the layouts of ireko do not change |
| C5 Later | Cell reads in the generated code (§7.4), other back ends, recalculation (§7.5) | A decision of the owner |

A separate item: the mutation score of the test kit was 95.47 %, near the gate of 95 %. Tests for its survivors gave it 99.5 % (2026-10-15).

## 13. Record

### 13.1 Phase C1

Phase C1 is done. The package `@mark1russell7/vex-compiler` has the loop IR (`loop.ts`), the lowering (`lower.ts`), the printer of JavaScript (`js.ts`), the runtime (`runtime.ts`) and the tiers (`tiers.ts`). The spec has the requirements COMPILE.TIERED, COMPILE.FALLBACK, COMPILE.TRACE and COMPILE.SOURCE.

The tests:

- P17 compares `tiered` with `evaluate` on three generators: the whole grammar, the chains of the builder, and list ops over axes. Tier 2 gave approximately 97 %, 85 % and 90 % of the values. The gate of the share is 50 %.
- The work put ten defects into the lowering, one at a time. P17 found each of them.
- The unit tests alone cover each statement and each branch of the package. The golden files hold the source of five programs.
- The mutation score is 100 % (997 mutants). Seven comments disable 30 equivalent mutants, each with its reason. Two tests count the reads of the host, so they find a cache that does not operate.

The speed, measured by `bench/gate.ts` on one machine:

| Program | Hand-written loops | Tier 1 | Tier 2 |
|---|---|---|---|
| The nearest other box, 60 boxes | 1 | 80 | 2.3 |
| One step of the Game of Life, 16 by 16 | 1 | 120 | 1.6 |

Two caches of the runtime give most of the speed:

- Each op site keeps the method of its last receiver. At each call, a read of the property must give the same method, so a changed prototype gives the new method. (§14.4 of the review did not add a cache without this read.)
- Each costly axis keeps its targets for each space and focus. A space does not change, so the targets do not change.

The rest of the time goes into the reads of the space and into the checks that the semantics need, for example `valid`. Phase C2 removes this time with the kinds and the inline forms.

These cases operate in tier 1: a list value with an error item, and a list op on a list value. An error of an extension and each other exception also operate in tier 1.

An item for the owner: npm trusted publishing needs the package on npm. Before the next release, the owner publishes `@mark1russell7/vex-compiler` once, or adds its trust, as for the other packages.

### 13.2 Phase C2: the speed lane

The first part of phase C2 is done. Two changes give the speed:

- **The fast path of each op site is in the source.** The options give the facts of each site: the domain whose op comes first, and the kinds and the lifts of its parameters (`facts.ts`). The printer writes a guard and the call of the op for each site, and each failed guard goes to the dispatch of the runtime. Before this change, all sites shared the code of the runtime. Thus the engine saw each op and each receiver at one place, and it did not optimize the calls.
- **A loop reads the records by index.** Each space of the core has `records`, in the order of its keys (SPACE.RECORDS). A loop over the keys reads `records[i]`, and the targets of an axis come with the index of each target.

The rules of exactness do not change. A guard uses `is` of a domain outside the `try` of the op. Thus an exception of `is` stops the program, and tier 1 gives the result. The interpreter counts such an `is` as `false`, so tier 1 is necessary there.

The speed, measured by `bench/gate.ts` with alternate samples on one machine:

| Program | Phase C1 | Phase C2 |
|---|---|---|
| The nearest other box, 60 boxes | 2.3 | 1.0 to 1.1 |
| One step of the Game of Life, 16 by 16 | 1.6 | 1.05 to 1.13 |

The plan had the kinds (§3.2) and the inline forms (§7.1) in this phase. A spike measured each change: the fast paths and the records by index give the target without them. The kinds are necessary for a module without a runtime, so they move to phase C3. The inline forms change the API of the domains, and they give more speed than the target, so they moved to phase C5. Later they moved to phase C3, after the kinds: a value in its components needs its kind.

#### The memo of each space

A node with a loop whose value depends only on the space has the same value at each origin. Such a node reads no focus and no origin, and no name from outside it. It also uses no table and no extension (`memo.ts`).

The program keeps a memo for each such node, with an entry for each space (COMPILE.MEMO). An entry holds the value of the node, or the fact of an error. Thus a run at each key of a space evaluates the node once. A space does not change, so the entry stays correct.

The memo needs no new API: the usual run at each key gets the gain. A value from the memo is the same object at each origin. The interpreter makes a new value at each origin, but the two values are equal and frozen.

The gate measures the share of each value in the total. The run at each of 1000 keys costs 2.0 times the run at each of 500 keys, so the cost is O(n). The cost of the interpreter grows 4 times, because it is O(n²).

Phase C2 adds three tests. A property gives many runs of one program on the same spaces. A test counts the calls in a node of the memo. A test gives the nodes of the memo for each kind of expression.

The mutation score of the compiler is 100 % of 1364 mutants. Comments disable 68 equivalent mutants, each with its reason. Most of them are labels of a `case` that gives the same value as a missing case.

#### Aggregates by group: the keys of the memo

A node can read the origin through a few values only: its keys. "The largest width in the column of the origin" reads the origin only through the column of the origin. Then the value of the node depends only on the space and its keys. The memo has an entry for each space and each value of the keys (COMPILE.GROUP).

The analysis (`memo.ts`) gives the keys of each node. A key reads the origin or a name from outside the node, and nothing that the node binds or reads at its own targets. A loop that reads the origin is a part of the node, not a key.

The program evaluates the keys where the node is. Inside the node, the value of each key replaces the key, also when the key has an error. Thus each error stays at its place. The node needs no new declaration from the domains, because the entry of a value of the keys is the value of the node itself. Each column evaluates once, so an aggregate by group costs O(n times the groups), not O(n²).

The memo keeps no entry whose keys hold an object or a function. Each run can make a new object, so such entries only fill the memo. The keys 0 and -0 have different entries, because an op can tell them apart.

The plan had a different solution: one pass for all groups. That needs an `eq` op with the equality of JavaScript, and a domain does not declare this. The keys of the memo need no such declaration.

#### Sheets: compiled formulas in a run

A `SheetRun` takes the option `compile`, for example `tiered` (SHEET.COMPILE). The run then evaluates each formula of a column with its compiled program. A cell reference stays an extension, so the search of the run does not change. After an error of a cell reference, for example `#CYCLE!`, tier 1 evaluates the formula again. The run gives the result of tier 1.

A formula compiles once for each compiler and its options, also across runs. A compiled program reads the cells of the active run, so it does not depend on one run. The formula of a single cell evaluates once in a run, so the run does not compile it.

The sheet app keeps the IR of each formula while its text and its context stay the same. Thus a change of a value compiles no formula again. With the compiler, the examples of the app take approximately 0.8 times the time of the interpreter. A property compares a run with `tiered` and the recursive reference, with each budget of the stack.

#### Sheets: the order of the cells

`SheetRun.fill` evaluates each cell of a table in a static order (SHEET.FILL). Each column comes after the columns that it reads. The keys of a column follow its reads from itself:

- A read of an earlier row gives the key order, and a read of a later row gives the reverse order.
- In a tree, a read of the children puts each child before its parent. A read of the parent puts each parent first.
- A read of the sibling after reverses the order of the siblings.

In a fill, a cell reference only looks for a finished cell. Thus the fill has no search and no recursion. A cell that reads a cell that is not finished goes to the search, so a cycle still gives `#CYCLE!`. The order only changes the speed, not a result.

The results of the finished cells are in a map for each column, by key. Before, one map had a text id for each cell. A key of an array space finds its record by its position.

| 20000 rows: a running total and a column that reads it | Time |
|---|---|
| The search, before | 160 ms |
| The search, with the new maps | 55 ms |
| A fill with the interpreter | 26 ms |
| A fill with `tiered` | 13 to 20 ms |

The sheet app and `table()` of the builder fill the table first. The remaining time is in the extension of each cell reference and in the maps. Generated code that reads the cells of a column as an array is the next step. It is an open item of phase C5.

### 13.3 Phase C3: ireko

#### The grid pilot

`@vex/pilots` has the strategy `grid` of ireko twice: `gridArrange` copies the arithmetic of ireko, and `GRID_PROGRAM` is one Vex program that evaluates at each child. Column widths and row heights are aggregates by group (COMPILE.GROUP). The start of a column is a sum over the earlier columns, in the order of the additions of ireko. A property compares the two on random layouts. The bits are the same in the interpreter and in tier 2, with no fallback.

#### The kinds

A domain can declare `primitive`: the JavaScript type of its values (KIND.PRIMITIVE). An op can declare `returns`: the kind of its result (KIND.RETURNS). The law checker of the test kit checks both declarations on random values. The scalar domains declare them.

`generate` takes a `schema`: the kind of each field of the records and of each variable. The lowering knows the kind of each literal, of each read of the schema, and of each result of an op with `returns`. The kinds go through `if`, `ifError`, the bindings, the list ops and the memo. When the kinds of the values of an op site decide its op, the site uses that op with no guard (KIND.STATIC). A read against the schema, or a result against `returns`, stops the program, and tier 1 evaluates it. A property compares such programs with the interpreter, also on records that break the schema.

#### The size of the generated code

ireko has a budget of 15 kB of minified gzip for its core, and its core uses 13.72 kB. Thus a generated strategy must fit in approximately 1.3 kB.

| The source of `GRID_PROGRAM` (376 nodes) | Bytes | Gzip |
|---|---|---|
| Tier 2, without a schema | 156909 | 24375 |
| Tier 2, with a schema: each op site is static | 135044 | 20539 |

The source of tier 2 has approximately seven lines for each node: the checks of each read, the blocks of the memo and the bindings. The kinds remove the guards, but most lines remain. Thus a standalone module has another printer.

#### Standalone modules

`emitModule` prints a program as an ES module with no import of Vex (COMPILE.MODULE). The module checks the schema once, at the start of a run, and an input against the schema throws a `VexContractError`. The module has statements and loops, as a person writes them:

- A binding is a variable, and a list op is a `for` loop with a running value.
- An error of Vex is a thrown sentinel. A binding, `ifError` and an item of a list op catch it, as in the interpreter. A key with an error gives `VEX_ERROR`.
- Each op is the text of the function of its domain. Thus the module has the bits of the interpreter. The printer gives samples of their kinds to each function and to its copy. A function that reads a name outside itself, for example `concat` of `TextDomain`, gives a reason, not code.
- An op whose function is one expression of operators, numbers, its parameters and the functions of `Math` is inline, with no call. An assignment, a call of a value and a quote stop the inline form.
- A part that depends on no key of the space is a constant of the run. It evaluates once, before the loop over the keys.
- A node of the memo with a loop of its own is one function of its keys. Two nodes with the same expression share the function.
- A node whose key is only in one test of a list op keeps its items. One pass gives the items, and each lookup uses them. With the test `===`, the lookup is a map of the groups. With `<` and values that do not decrease, the lookup is a binary search on the prefixes.

The printer takes a part of the language. It takes an array space, the fields and the variables of the schema, and the axes `all`, `others` and `window`. Each op site must have a static op. Another construct gives a reason. A property compares random programs with the interpreter, and the grid pilot compares the module with the code of ireko. The golden files `__golden__/module-*.js` keep the text of some modules, so a change of the text shows in review.

| The strategy `grid` | Bytes | Gzip |
|---|---|---|
| The module of `GRID_PROGRAM` | 9440 | 2768 |
| The module, minified | 4360 | 1851 |
| `grid.ts` of ireko, minified | 2615 | 1186 |

The module is a part of the core of ireko, so its helpers are small. The helper of a node that keeps its items has only the parts that the nodes of the module use. Only the checks before the run throw a `VexContractError`, so each catch of the run gives the sentinel directly. A count of all the items, whose body cannot fail, is the count of the records.

A branch of ireko (`vex/grid-module`, not merged) uses the module in the strategy `grid`. The 213 tests of ireko pass, also its golden SVG files. The size check of its core gives 14.97 kB of 15 kB. Before the module, it gave 13.72 kB.

#### The speed of a module

The first printer made one expression with closures for each node. Its module was approximately 15 times slower than the code of ireko. In the benchmark of the engine of ireko, the trees of 111 nodes were approximately 2.2 times slower. The printer of statements and loops replaced it.

| One run of the grid | The code of ireko | The module |
|---|---|---|
| 10 children | 1.2 to 1.6 µs | 4.5 µs |
| 100 children | 4.2 to 6.7 µs | 32 µs |

A run of the module is still slower than the code of ireko. Each lookup of a node of the memo goes through a map. But the grid is a small part of a layout. In the benchmark of the engine, four runs alternated between ireko and the module. The two are in the noise of the machine:

| The benchmark of the engine, layouts each second | ireko | The module |
|---|---|---|
| 111 nodes, nested | 1051 and 1537 | 1733 and 1610 |
| 111 nodes, linked | 1018 and 1378 | 1345 and 1390 |
| 1111 nodes, nested | 77 and 117 | 119 and 112 |
| 11111 nodes, nested | 4.7 and 6.5 | 7.7 and 5.8 |

Thus the benchmarks of ireko hold. The branch of ireko waits for a decision of the owner.

#### The radial pilot

The strategy `radial` of ireko puts the children on a ring. Three cases have a closed form: one child, a part of a ring, and a full ring of more than 256 children. A full ring of 2 to 256 children finds its smallest radius with a bisection. That search needs `iterate`, so it comes in phase C4.

`radialArrange` copies the closed form of ireko, and `RADIAL_PROGRAM` is one Vex program that evaluates at each child. `radialClosed` tells if an input has a closed form. A property compares the program with the copy in the interpreter, in tier 2 and in the module. The bits are the same. For this pilot, `NumDomain` has the ops `sin`, `cos`, `asin` and `hypot`.

| The strategy `radial` | Bytes | Gzip |
|---|---|---|
| The module of `RADIAL_PROGRAM` | 3996 | 1291 |
| The module, minified | 2054 | 931 |
| The module, minified, after the module of `grid` | | 637 more |
| `radial.ts` of ireko, minified, after the module of `grid` | 2527 | 1144 more |

The module has no search, so ireko keeps its own code for most rings. The module adds approximately 600 bytes to the core, and the core has 30 bytes free. Thus ireko does not use the module before phase C4. Then one module can replace all of `radial.ts`.

| One run of `radial` | The code of ireko | The module |
|---|---|---|
| 10 children, a half ring | 0.6 to 1.1 µs | 1.3 to 1.8 µs |
| 300 children, a full ring | 17 to 50 µs | 37 to 93 µs |

The module is approximately two times slower. A module without the checks of finite numbers and without the `try` blocks in its loops has the same speed. Thus the cause is elsewhere.

#### The full ring (phase C4)

With `fold` and `iterate`, `RADIAL_PROGRAM` has each case of `radial`, also the search. The test of a radius is a fold over the children, with a fold over the later children in each step. Thus each angle comes from the same sums as in ireko. The bisection holds the test of the middle in the name `good`, so each step tests once. The bits are the same in the interpreter, in tier 2 and in the module.

A constant of the run with a loop is lazy in a module: it evaluates on its first read. Before, the module evaluated each constant before the run, also a loop in a branch that the run does not take.

A part of a loop over the targets can depend only on the target and on the constants of the run. Then it is a column of the run. The module computes it once for each record, on its first read, with the helper `Q`. Two parts with the same structure share one column.

A part with little work is not a column. Its work counts its nodes, and a node of the memo or a constant of the run counts as one node. A call also counts the nodes of the body of its function, because the body evaluates at each call. A body that is a column itself counts as one node, so its call is not a second column. A node of the memo with keys keeps its costly part for each key already, so a part with one is not a column. Thus the module of `grid` is the same.

| The full module of `radial` | Bytes | Gzip |
|---|---|---|
| Before the columns, minified | 23289 | 4335 |
| With the columns | 23124 | 4914 |
| With the columns, minified | 8433 | 2939 |
| With the columns, minified, after the module of `grid` | | 2628 more |
| With functions (FN.*), minified | 4691 | 1960 |

| A full ring, one run | The code of ireko | Before the columns | With the columns |
|---|---|---|---|
| 6 children | 6 to 14 µs | 190 to 250 µs | 29 to 30 µs |
| 30 children | 23 to 42 µs | 1.2 to 2.1 ms | 124 to 131 µs |
| 120 children | 141 to 372 µs | 11.6 to 15.1 ms | 1.05 to 1.11 ms |

The module is approximately five times slower than ireko, and approximately 1.5 kB larger. Vex has no functions, so the test of a radius is in the program four times. Each copy of the fold over the pairs is a loop of its own. The angle of a child depends on the radius under test, so it is not a column. Thus the fold over the pairs computes it again for each pair. A column with keys keeps a value for the last values of some names. It made the module slower, because most of its keys change at almost each read. Functions or lists in Vex are the better fix.

With functions, `RADIAL_PROGRAM` binds the test of a radius and its parts once, and the module prints each of them once: nine JavaScript functions. The bits stay the same in each stage.

The engine benchmark of ireko in CI (2026-10-18, the nightly runs 39154433914 and 39154435929) measured this module. A layout with the strategy `radial` was 2.0 to 2.2 times slower than ireko. The cause was a defect of the printer. The work of a call counted one node, not the nodes of the body. Thus the call of `need` was not a column. The test of a radius computed `need` again for each pair, with its loop over the next child. The module before functions had the body at each call, so the body was a column. The fix: the work of a call counts the body of its function.

A local branch of ireko (`vex/radial-module`, after `vex/grid-module`) uses the module in the strategy `radial`. The 213 tests of ireko pass, also its golden SVG files. The core is 16.58 kB, so the branch sets the limit to 17 kB. The benchmark of the engine alternated between ireko and the branch, two times each:

| The benchmark of the engine, layouts each second | ireko | The branch |
|---|---|---|
| 111 nodes | 1881 to 2072 | 1343 to 1599 |
| 1111 nodes | 148 to 169 | 106 to 143 |
| 11111 nodes | 11.8 to 14.7 | 10.1 to 12.3 |

A layout with the strategy `radial` is 15 % to 28 % slower, so the benchmarks of ireko do not hold for `radial` yet.

#### The audit pilot

After a layout, the audit of ireko gives two checks. `ESCAPE` finds each node that is not inside its container, the nearest ancestor in the nested mode. `OVERLAP` finds each pair of boxes that overlap.

`ESCAPE_PROGRAM` evaluates at each node, and `escapes` copies the code of ireko. A property compares the two in the interpreter, in tier 2 and in the module. The results are the same. `OVERLAP` is a sweep over the sorted boxes, in O(n log n). A program over the axis `others` costs O(n²). Thus `OVERLAP` waits for the domain kernels of phase C4.

A node of ireko has the index of its container. The first program had only fixed moves, so it found the container with the test `i = c` over all the nodes. The module made a map of the groups for this test, one map for each field of the container. The owner then accepted the computed moves (NAV.COMPUTED): `index(e)` and `key(e)` take the position or the key from an expression, as `INDEX` of a spreadsheet. The program reads each field of the container at `index(c)`, and the module reads `R[I(c, n)]`.

| `ESCAPE` for each node | The code of ireko | The module, the test `i = c` | The module, `index(c)` |
|---|---|---|---|
| 111 nodes | 0.6 to 1.0 µs | 43 to 50 µs | 6.4 to 9.0 µs |
| 11111 nodes | 58 to 161 µs | 9.2 to 11.5 ms | 0.65 to 0.68 ms |

The module is still approximately ten times slower than ireko. It reads the container five times, and it checks the schema of each record. A layout of 11111 nodes takes approximately 150 ms, so the check adds less than 1 % to it.

#### Computed moves

The key of `key` and the position of `index` can be an expression. The expressions of an address evaluate first, at the node, and then the moves apply. Each stage has them:

- The interpreter, `explain` and the reference interpreter of the test kit evaluate them. The random programs of the test kit have them.
- `deps` keeps the expression in the address, and it gives the reads of the expression too. Only a run knows the key.
- JSON keeps the literals of the expression in their JSON form.
- The builder takes a chain in `.index()` and `.to()`. The formulas have `index(e).` before a name.
- Tier 2 evaluates the expressions and gives their values to `addr` of the runtime. The memo counts their reads as reads of the node.
- A module uses the helpers `I` and `K`, which check the position or the key.

A cell reference is data of an extension, not an expression, so it takes only fixed moves. A formula reads a formula column at a computed row as the one item of the axis `window(0, 0)`, whose address has the computed move.
