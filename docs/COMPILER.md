# The Vex compiler: architecture and plan

*Written: 2026-10-13. Status: accepted. §11 gives the decisions of the owner.*

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

`AVERAGE(all.Score)` is the same at each row. The interpreter computes it at each row, so the cost is O(n²). A batch run (`all`) computes such a node once, so the cost is O(n).

### 7.3 Aggregates by group

"The width of a column is the largest width in the same column" is a group. One pass gives the value of each group, not one pass for each row.

### 7.4 Sheets

A sheet whose cell references have fixed addresses has a fixed order of evaluation. The compiler gives straight-line code in that order, like the calculation chain of a spreadsheet. A recurrence over `row(-1)` becomes one forward loop.

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

## 9. Packages

- `@mark1russell7/vex-compiler` is a new published package. It has the analysis, the lowering, the back end of JavaScript source, the tiers, and `emitModule` for builds. The core stays small, because a page that does not compile does not load the compiler.
- The core gets the optional field `returns` of an op spec. It also exports the functions that generated code calls: the space functions and the dispatch of an op.
- The API of the compiler:

| Function | What it does |
|---|---|
| `generate(expr, options)` | The loop IR and the JavaScript source of a program, with its constants. It is pure, so a build can use it. |
| `load(generated, options)` | A program of tier 2, made with `new Function` |
| `tiered(expr, options)` | Tier 2 when it can, and else tier 1. After a failed check, tier 1 does that evaluation again. |
| `emitModule(programs, options)` | An ES module for a build, standalone or with the fallback |

Each program has the `Program` interface of the core (`run`, `explain`), so each tier can replace another tier.

## 10. Tests

- **Property P17**: on random programs and random spaces, `tiered` gives the result of the interpreter. The test also reports the share of programs in tier 2, so a fallback cannot hide a gap.
- **Golden files** of the generated source for fixed programs. A change of the generated code shows in the diff.
- **The speed gate** of the nightly workflow: generated code within 1.2 times the hand-written loops for the programs of the speed lane.
- **Standalone modules**: a test imports a generated module and compares it with the interpreter.
- The mutation lane covers the compiler package at 95 % or more.

## 11. Decisions of the owner

The owner made these decisions on 2026-10-13:

1. The compiler is a new stage after the IR (option 2). The interpreter stays as it is, and properties prove that the compiler gives its results.
2. The architecture has the stages of §2 and the tiers of §2.1. The build and the run time use one compiler.
3. Vex is the source of the strategies of ireko, compiled at the build of ireko.
4. Vex has only bounded iteration (§8), so each program ends.

## 12. Roadmap

| Phase | Deliverables | Done when |
|---|---|---|
| C1 The compiler | The package, the kinds (§3.2), `returns` on the ops of the built-in domains, the loop IR, the back end of JavaScript source, `tiered`, the checks and the fallback, P17, golden files, the speed gate | P17 passes, and the speed lane is within 1.2 times the loops |
| C2 Speed | Inline forms from one definition, work that does not depend on the origin, aggregates by group, sheets with fixed addresses | The batch programs have the cost O(n) |
| C3 ireko | `grid` as a Vex program, standalone modules in the build of ireko, then the closed form of `radial` and the audits | The golden files of ireko do not change, and its benchmarks hold |
| C4 Iteration | `fold`, `iterate`, domain kernels, then `tree` and `layers` of ireko | Each construct passes each stage, and the layouts of ireko do not change |
| C5 Later | Other back ends, recalculation (§7.5) | A decision of the owner |

A separate item: the mutation score of the test kit is 95.47 %, near the gate of 95 %. Tests for its survivors give it more margin.
