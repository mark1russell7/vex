# Vex: review and plan

*Date: 2026-10-08. Baseline: `main` at `f54ee88`. The July audit files ([ARCHITECTURE](./archive/2026-07/ARCHITECTURE.md), [BUGS](./archive/2026-07/BUGS.md), [ROADMAP](./archive/2026-07/ROADMAP.md)) stay valid as evidence. This document replaces the July roadmap.*

This review answers four requests:

1. Move Vex to the standard monorepo that `new-repo.ps1` makes from `~/git/template`.
2. Update all dependencies.
3. Add `ste-lint` the same way `lag` and `mark1russell7.github.io` do.
4. Review the architecture, the original intent, the current state and the key ideas. Then give a full plan for the code, the tests, CI and an interactive documentation site.

The document follows the family writing rules (ASD-STE100, checked with `ste-lint`).

---

## 0. Summary

**What Vex is.** Vex evaluates small programs at one position in a collection of records. A program reads fields relative to that position, combines them with domain operations, and gives a total result. Axes lift one program to all positions or to relations between positions. In one phrase: **typed spreadsheet formulas over domain objects.**

**The verdict.**

- The ideas are good and rare. The research found no other tool with all of these parts:
  - typed domain adapters and a typed fluent chain
  - relative and absolute references over keyed collections
  - total evaluation with explanations, and checked algebraic laws.
- The implementation is not a base to build on. Its surface is `any`, its focus is shared mutable state, and its op registry mutates class prototypes.
- The history shows the root cause. **The spec was not executable at any time.** Thus the spec features regressed and no test showed it.

**New findings in this review** (all reproduced, refer to §3):

- The first version (2025-08-30) did not run at any time. Its Vector adapter throws at import.
- The rewrite that first made the code run (2025-09-24) silently removed `peers()`, the typed `prop()` and the Optional helpers.
- **The peer axis was not correct in any version.** The v0 `peers()` gives `0` for each peer in spec example §18.2 (V-042).
- Four more new defects:
  - String arguments become references (V-038).
  - The expression proxy records `build` as an op (V-039).
  - `self()` without a key does nothing (V-040).
  - Expressions are "thenables" that hang `await` (V-041).
- Vex comes from `Jqy`, a layout engine. `brand.ts` is byte-identical, and `Vector` differs only in import paths.
- No code in `~/git` uses Vex. `render` names Vex as an ancestor but rebuilt its own kernel. `Graph`, the live product, has its own expression language. Graph still does its peer-relative layout math in 636 lines of imperative TypeScript.

**The plan in six phases** (§11):

| Phase | Result | Effort |
|---|---|---|
| P0 | Monorepo from the template, dependencies updated, ste-lint, CI, Pages on | 1–2 days |
| P1 | New kernel: spaces, addresses, a tree IR, domains, interpreter, `explain()` | 2 weeks |
| P2 | Typed builder, all axes, domains ported, old code deleted | 2 weeks |
| P3 | Assurance: conformance suite, property tests, type tests, mutation tests | parallel to P1–P2 |
| P4 | The site "Vex Lab": tour, step debugger, spreadsheet view, living spec, playground | 3–6 weeks, parallel |
| P5 | Interop and product: `deps()`, `sheet()`, a Graph layout pilot, npm release | 2–3 weeks |

**Decisions for the owner** are in §12. The most important one is D1: give Vex a real consumer. The best candidate is the Graph layout strategies.

---

## 1. Scope and method

This review examined:

- each line of the Vex source, tests, spec and git history, and the July audit files
- `~/git/template`, `new-repo.ps1`, `lag`, `mark1russell7.github.io`, `ste-lint` and `cue`
- the related repos `Jqy`, `render`, `Graph`, `Graph2`, `MetroGraph`, `tiller` and `splay`
- the web: approximately 70 primary sources on theory and prior art, and live npm and GitHub data for versions.

Each new defect in §3 was reproduced with a temporary test that was deleted after the run. The v0 code was extracted from commit `47e15ce` and run separately. Two design prototypes were type-checked with TypeScript 7.0.2: [`docs/spikes/typed-chain.ts`](./spikes/typed-chain.ts) and [`docs/spikes/store-laws.ts`](./spikes/store-laws.ts). This review changed no source code. The five research reports are in [`docs/research/`](./research/README.md), without changes.

---

## 2. Origin and intent

### 2.1 Where Vex comes from

Vex was extracted from `Jqy` (2025-08-21 to 08-30), a layout engine with grid strategies, radial strategies and nested containers. The evidence:

- `Vex/brand.ts` is byte-identical to `Jqy/src/components/core/ids-branding/brand.ts`. This explains `NodeId`, `EdgeId` and `LayoutId`.
- `Vex/math/vector/vector.ts` differs from the Jqy vector file only in its import paths. This explains `asPosition`, `asSize`, `asOffset` and `asCenter`.
- Spec example §18.1 is a layout separation test: `position + size - other.position`.

The name reads as "vector expressions". **The original intent was relative layout math over keyed collections of nodes**, then made general for any domain.

### 2.2 The family of related projects

Vex is one step in a line of projects about expressions over structured objects:

| Dates | Repo | What it built |
|---|---|---|
| 2024-01 to 2026-10 | `Graph` | The live product (712 commits). The first `NotFound` and `isFound`, relative dimensions, the `roll/ball/lense` fluent chain (removed 2026-07-06), and since 2026-06 the JSON `agg-expr` language |
| 2024-06 | `Graph2` | Design notes: the "seat value graph", `FillMany`, handlers ordered by dependency |
| 2025-04 | `MetroGraph` | Design only: `$path` bindings, descendant bindings, a unified dependency graph |
| 2025-05 | `Funk` | `Optional<T> = Either<NotFound, T>`, used only by Vex |
| 2025-08 | `Jqy` | The layout engine that Vex came from |
| 2025-08/09 | `Vex` | Spec v0.9, the step IR, adapters, axes, then locals and optics. "Biblo" first appears here. |
| 2025-10 | `tiller` | Reactive paths |
| 2026-02 to 07 | `render` | A new kernel: `Lit \| Ref \| App` IR, its own Optional, the `biblo` class registry, a reactive engine |

The `render` architecture document names its sources: "Synthesized from Graph (lenses + relative dimensions), Graph2 (seat value graph …), MetroGraph (…), **Vex (analyzable IR + scoped evaluation)**, Splay (…), Tiller (…)".

### 2.3 What only Vex has

`render` and Graph solved other problems: reactivity, composition and storage. Neither has these Vex ideas:

- the collection axes (`traverse`, `peers`, `other`) and the matrix scope
- typed domain values through adapters, and declared algebraic laws
- scalar lifting (`add(5)` lifts `5` into the domain)
- named locals with value kinds, and Optional lenses with `set`
- monoid reductions in a lenient and a strict form
- a normative spec with laws and a conformance checklist.

Graph does the math that Vex was made for (force-directed, packed and grid layouts) as imperative TypeScript (`layout-registry/layouts.ts`, 636 lines). **That is the gap that Vex can fill.**

---

## 3. Where Vex is at this time

### 3.1 The history, corrected

| Date | Commit | Event | Meaning |
|---|---|---|---|
| 2025-08-30 | `47e15ce` | First code: IR, `BaseChain` **with `peers()`** and a typed `prop()`, an evaluator built on `chainOpt`. No `package.json`, no tests. | A clean draft that did not run at any time. Its Vector adapter throws at import (`annotateOp: 'add' is not a function`). |
| 2025-08-30 | `5f93395` | The README becomes the formal spec v0.9. | The spec agrees with the v0 draft. Nothing tests it. |
| 2025-09-24 | `b95eddb` | First `package.json` and first tests. Adds locals, optics, Angle and Color. | The first version that runs. It silently drops `peers()`, the typed `prop()` and the Optional helpers. The factories start to give `any`. |
| 2025-09-25 | `ef7ba44` | NDVector, NDV, TBBox, Factory, the lifted adapter, NDV steps. | Expansion toward a general framework. The evaluator imports `NDVector`. |
| 2026-04-28 | `f54ee88` | A small edit to the optics. | Dormant since then. |

The July audit said that the spec drifted from the code. The history says otherwise. The spec and v0 agreed. The rewrite that made the code run removed spec features, because no test protected them. **Each plan item in §8 comes from this lesson: make the spec executable.**

### 3.2 State in numbers

| Measure | Value |
|---|---|
| Library source | 2,186 lines (`dsl/` 1,555) |
| Tests | 20 tests in 11 files, 427 lines, all pass in 4 s |
| `as any` casts | 106 |
| Hand-written Optional extractions (`foldEither(o, () => null, r => r)`) | 30 |
| Raw `.tag` or `.right` reads in `dsl/` and `tests/` | 40 |
| Known defects | 37 from July, plus 5 new ones (below) |
| Type errors under the template's strict preset (TS 7.0.2) | 437, of which approximately 170 need real work |
| `ste-lint` findings with the default rules | 456 (358 errors), 325 of them in the July audit files |

The tests cover the named-locals path and the NDV math. The main spec surface (the `._` proxy, `other()`, `traverse(expr)`, reducers, lifting) has almost no tests.

### 3.3 New defects (added to [BUGS.md](./archive/2026-07/BUGS.md))

| ID | Sev | Finding | Reproduction |
|---|---|---|---|
| V-038 | S1 | A string argument is always a property reference, and a pair of strings is always an `[key, prop]` reference. Domain methods with string or array parameters thus cannot be used. | `prop("v")._.pick(["x","y"])` gives `none`. The direct call gives `{x:1,y:2}`. |
| V-039 | S2 | The `domainExpr` proxy records any property as an op. The spec API `expr.build(adapter)` (§9.3) becomes an op named `build` with the adapter as an argument. | `vectorExpr().build(VectorAdapter)` records `[{op:"build"}]`. |
| V-040 | S1 | `self()` without a key does nothing. It cannot go back to the start after `other()`. | `.prop("position").other().self()._.add("size").value("A")` adds B's size. |
| V-041 | S2 | Expressions are "thenables", because the proxy gives a function for `then`. `await expr` does not finish, and a `then` step stays in the program. | `await vectorExpr().add("size")` hangs. The steps become `["add","then"]`. |
| V-042 | S1 | The peer axis was not correct in any version. In v0, the program's own `self("A")` and the axis loop change the same mutable focus. | v0 gives `[0,0,0]` for §18.2 (the minimum must be `1`), and `(0,0)` for §18.3 (must be `(-9,-12)`). |

V-042 is the most important result. **The mutable-focus model cannot express the main axis of the language.** A fix needs two positions at the same time: the origin and the target (§6.3).

### 3.4 Position in the ecosystem

- No repo in `~/git` imports Vex or Funk.
- There are four Optional encodings that do not agree: Funk (`Left/Right`), `@render/optional` (`none/some`), Graph (an untagged `NotFound` symbol) and `client-collections` (`_tag`). None of them is published.
- The vector code exists three times: Jqy/Vex `Vector`, `render` `pack/vector.ts` and Graph `rectangle-packing/vector.ts`.
- Graph removed its own fluent chain in July 2026. The commit says: "expressions are THE state-access story". This is a warning for Vex: a fluent API must produce data that a host can keep. It must not be the semantics itself.

---

## 4. The key ideas

Without the implementation errors, Vex has six ideas. Each idea has a name in the literature. The name gives laws to test and a known way to implement it.

| # | Vex idea | Formal name | What the name gives |
|---|---|---|---|
| 1 | `"size"` is the size at the focus, `["B","size"]` is B's size, `other()` moves the frame | **Store comonad** (a focused container), the zipper | Laws for property tests, and a proof that the model is consistent |
| 2 | One formula runs at each key | **Spreadsheet** relative and absolute references (R1C1), `extend` | A mental model that all users know already |
| 3 | `traverse`, `peers`, `other` | **Axes as relations** between an origin and targets (XPath axes, jQuery `.siblings()`, SQL `EXCLUDE CURRENT ROW`) | A small algebra: union, composition, filters |
| 4 | Each failure becomes `none` | **Railway-oriented programming** plus **error values** (Excel `#REF!`, `#VALUE!`) | Totality, and a reason for each failure |
| 5 | Adapters with `commutative` and `associative` flags | **Typeclass dictionaries** with laws (static-land, `fp-ts-laws`, Algebird) | Safe tree reductions, but only if the laws are checked |
| 6 | Named locals and lenses that build values from fields of peers | **Reader/Env** plus **affine optics** | Lexical bindings in place of a mutable map |

The Store comonad gives a direct map from Vex to known operations:

| Vex | Store operation | Law to test |
|---|---|---|
| a relative reference `"size"` | `extract`, then project | `extract(seek(k, w))` reads key `k` |
| `["B","size"]` | `peek("B")` | `peek(pos(w), w) == extract(w)` |
| `self(k)` | `seek(k)` | `seek(k)` with an unknown key gives `#REF!`, not the old focus |
| `other()` | `seeks(swap)`, only in a pair | `other` twice equals the origin |
| `traverse(p)` | `extend(p)` | `extend(extract) == id` and `extract(extend(p)(w)) == p(w)` |
| `peers(p)` | `experiment(k => keys without k)` | `peers(p)` equals `traverse(p)` without the origin |

The prototype [`docs/spikes/store-laws.ts`](./spikes/store-laws.ts) checks all these laws on 2,000 random cases. The current implementation fails several of them.

**A name to change.** In SQL and Vega-Lite, "peers" means rows with equal sort keys. Use `others()` for the Vex axis, and keep `peers()` as an alias for the spec.

---

## 5. Diagnosis

### 5.1 Eight structural causes

The July audit found five structural flaws. This review adds three.

| # | Cause | Effects |
|---|---|---|
| 1 | Op metadata lives on shared class prototypes and is registered by import side effects | Adapters contaminate each other. A build tool can remove the registration (V-002, V-003). |
| 2 | The focus is one shared mutable value | Silent wrong values, results that change with the order of calls, and no correct peer axis (V-004, V-005, V-040, V-042) |
| 3 | Two separate "locals" worlds | Eight chain methods have no effect (V-006) |
| 4 | The declared IR type omits 10 of the 13 real step kinds | A 370-line evaluator that operates on `as any[]` and imports `NDVector` (V-020, V-021) |
| 5 | The public surface is `any` | `tsc` accepts any chain (V-012) |
| 6 | **New:** the argument rules guess the meaning of a string | Methods with string parameters cannot be used (V-038) |
| 7 | **New:** proxies catch every property name | `build`, `then` and symbols become ops (V-039, V-041) |
| 8 | **New:** the spec is prose, not tests | Each regression in §3.1 happened without a signal |

### 5.2 SOLID check

| Principle | At this time | Evidence |
|---|---|---|
| Single responsibility | Fails | `eval.ts` does dispatch, locals, NDVector assembly, lifting, shape checks and strict mode. `BaseChain` builds, evaluates, drives traversals and owns the scope. Scopes call `adapter.isInstance`, so data access knows about domains. |
| Open/closed | Fails | A new step kind needs edits in the evaluator, the mixin and a type union that does not list it. A new domain needs prototype mutation at import. |
| Liskov substitution | Fails | `MatrixScope.setFocusToOther` does nothing where `MapScope` changes the focus. One adapter changes the behavior of another adapter. `NDV` gives `NDV` from `scale` but `NDVector` from `add`. |
| Interface segregation | Fails | `DomainAdapter` has seven members, and code uses only some of them (`methodReturns` is not used at all). `Scope` mixes reads, raw reads and focus changes. The chain shows approximately 25 methods, and 8 have no effect. |
| Dependency inversion | Fails | The generic evaluator imports the concrete `NDVector`. Adapters write into domain prototypes. |

---

## 6. Target architecture: Vex 1.0

### 6.1 The model

> **A Vex program is a total function. It runs at one position in a space of records. It reads fields relative to that position and combines them with domain operations. Axes lift it from one position to relations between positions.**

Seven parts, each with one job:

| Part | Job | Replaces |
|---|---|---|
| **Space** | The records, the key set and the topology (record, array, grid, pair, later a tree) | The data half of `Scope` |
| **Address and axis** | Where to read: origin, key, other, offset. Relations: all, others, neighbors, pairs. | `Switch`, the `setFocus*` mutations and the missing `peers` |
| **Expression** (IR) | What to compute, as plain JSON data | The declared step union and the 10 undeclared `local:*` steps |
| **Domain** | Which values belong, which ops exist, their laws and lifting | `DomainAdapter`, `annotateOp`, `methodParams`, `methodReturns` |
| **Interpreter** | Semantics: `(expression, origin, space) → Result` plus a trace | The `eval.ts` monolith |
| **Builder** | Typed method calls → expression. No other job. | `BaseChain`, the `withLocal` mixin and the `domainExpr` proxy |
| **Traversal** | Aggregation over the results of an axis | `traversal.ts` (mostly kept) |

Two services cross all parts: **Trace** (each evaluation can explain itself) and **Extensions** (new expression kinds, ops and axes without a change to the core).

### 6.2 Spaces and addresses

A space is an immutable, representable container: `keys`, `index(k)` and `tabulate(f)`. A run has an **origin** (where it started) and a **focus** (where relative references read). Both are values. Nothing changes them in place.

The builder resolves navigation **when it builds the expression**, not when the expression runs. After `.other()`, the next string argument becomes a reference with the address `[other]`. After `.self()`, the address is empty again. The builder normalizes addresses with small rules: `other` twice is empty, two offsets add, and a key replaces what was before it. At run time, an address resolves against the space or gives `#REF!`.

Thus the runtime has no focus state at all, apart from the target inside an axis. This removes V-004, V-005, V-019, V-040 and V-042 by construction.

### 6.3 Axes are relations

**An axis is a relation between an origin and the targets that it reads.** Evaluation over an axis is: for each target `t` of the origin `o`, evaluate the body with the focus at `t`. The base value comes from the origin.

| Axis | Relation | Status at this time |
|---|---|---|
| pipeline | the origin only | works, with mutable focus |
| `all()` (old `traverse`) | each key, as its own origin | works, but leaves the focus on the last key |
| `others()` (old `peers`) | each key except the origin | missing, and wrong in v0 (V-042) |
| `other()` | the only other key in a pair | silent no-op outside a pair |
| `pairs()` | each ordered pair of different keys | new: collision tests and repulsion need it |
| `neighbors(4 \| 8)` | grid adjacency | new: stencils and cellular automata |
| `where(test)` | any axis, filtered by a Vex boolean expression | new: "others within radius r" |

`all()` gives a keyed space, not a list. A second program can then read the results of the first one. That is coKleisli composition: "compute the positions, then compute offsets from the computed positions". Later, `sheet()` evaluates several named columns in dependency order and gives `#CYCLE!` for a cycle.

### 6.4 One tree IR, compatible with render

The new IR is a tree, not a step list. Its first three kinds are the same as `render`'s `Lit | Ref | App`. Thus a `render` expression is also a Vex expression.

```ts
type Move =
  | { readonly t: "key"; readonly key: string }          // absolute, like $B
  | { readonly t: "other" }                               // the other key of a pair
  | { readonly t: "offset"; readonly d: readonly number[] } // relative, like R[-1]C[0]
  | { readonly t: "origin" };                             // back to the start of the run
type Addr = readonly Move[];                              // [] = the current focus

type Expr =
  | { readonly tag: "lit"; readonly value: unknown }
  | { readonly tag: "ref"; readonly path: readonly string[]; readonly at?: Addr }
  | { readonly tag: "app"; readonly op: string; readonly args: readonly Expr[] }
  | { readonly tag: "let"; readonly bind: Readonly<Record<string, Expr>>; readonly body: Expr }
  | { readonly tag: "var"; readonly name: string }
  | { readonly tag: "rec"; readonly fields: Readonly<Record<string, Expr>> }
  | { readonly tag: "each"; readonly axis: Axis; readonly body: Expr }
  | { readonly tag: "ext"; readonly kind: string; readonly data: unknown };
```

Spec example §18.1, as the builder writes it and as data:

```ts
vex(Vec2).over(space.record({ A, B }))
  .from("position")._.add("size").other()._.subtract("position")._.anyNonPositive();

app("anyNonPositive", [
  app("subtract", [
    app("add", [ref(["position"]), ref(["size"])]),
    ref(["position"], [{ t: "other" }]),
  ]),
]);
```

Spec example §18.2, with the two positions made explicit:

```ts
vex(Vec2).over(space.record({ A, B, C, D }))
  .from("position")
  .others((e) => e._.subtract("position")._.length())   // e starts as the base value of the origin
  .min();

let_({ base: ref(["position"]) },
  app("min", [each({ t: "others" },
    app("length", [app("subtract", [v("base"), ref(["position"])])]))]));
```

What this tree removes:

- **The two argument worlds become one.** Each `local:*` step becomes `let` plus an argument. `applyUsing("add", ["rhs"])` becomes `app("add", [cur, v("rhs")])`. The builder orders arguments by parameter names when it builds.
- **`NDVector` leaves the core.** `rec` makes a plain record, and a domain op (`NDVector.from`) turns it into a value. The three NDV steps become one `let` with `rec` and `ref` arguments.
- **Optics become references.** `P("pos","x")` is `ref(["pos","x"])`. Function lenses stay possible only as an `ext` kind that is marked "not serializable".
- **Programs are data.** `JSON.stringify` round-trips them. The site, the trace viewer, memoization (spec §17) and a future optimizer use this data.

### 6.5 Domains own their registry

```ts
export const Vec2 = defineDomain({
  name: "Vec2",
  is: (u: unknown): u is Vector => u instanceof Vector,
  fromScalar: (n) => Vector.scalar(n),               // this enables lifting
  ops: {                                             // metadata lives HERE, not on Vector.prototype
    add:      { laws: ["commutative", "associative"], identity: () => Vector.scalar(0), liftScalar: true },
    multiply: { laws: ["commutative", "associative"], liftScalar: true },
    subtract: { liftScalar: true },
    length:   {},
  },
});
```

- There are no import side effects. Thus adapters cannot contaminate each other, and `sideEffects: false` becomes correct (V-002, V-003).
- Only declared ops can run. Inherited members, for example `toString`, are not ops (V-008).
- Parameter and return types come from the class methods. The `methodReturns` table is not necessary (V-024).
- `laws` are claims. `@vex/testkit` checks each claim with property tests. This finds the false `commutative` flag on `Color.add` (V-016) at the first run.
- Optional capabilities are separate small interfaces: `Liftable`, `FromRecord`, `Viewable` (a `view()` that draws a value on the site).

### 6.6 The typed builder (verified)

The prototype [`docs/spikes/typed-chain.ts`](./spikes/typed-chain.ts) uses the tRPC pattern: an untyped runtime proxy, cast to a mapped type from the domain's declared ops. It adds the Kysely type-state pattern: each call gives a builder type for the new value kind.

**Measured with TypeScript 7.0.2 (the template version):** zero errors, all ten negative cases rejected, 1,833 type instantiations, 0.02 s of check time.

| Rule | What the types do | Closes |
|---|---|---|
| Immutable builders | Each call gives a new chain | V-010 |
| `from(p)` | Accepts only fields that hold the domain type | V-012 (this existed in v0 and was lost) |
| `._` | Lists only declared ops, with their real parameter types | V-008, V-012 |
| Arguments | A bare string is a field reference of the right type. A string value needs `lit("x")`. A reference to another key uses `of("B","size")`. | V-038 |
| Value kinds | After `length()` the value is a `number`, so `._` is gone | spec §11, for free |
| `other()` | Exists only on a pair space | V-005, at compile time |
| No catch-all proxy | Ops live only under `._`. `then`, `build` and symbols are not ops. | V-039, V-041 |

Multi-domain chains use the same design. `vex(Vec2, Angle, Color)` sends each call to the domain whose `is` accepts the current value, and the type of `._` follows the value. Thus the composite test, which uses plain TypeScript at this time because the DSL cannot mix domains, becomes one chain.

### 6.7 Errors that explain themselves

Internally, evaluation gives `Result<T, VexError>`. The public `value()` keeps `Optional<T>`, so callers keep the same shape. `result()` and `explain()` give the reason.

| Code | Cause | Closes |
|---|---|---|
| `#REF!` | Unknown key, `other` outside a pair, a grid position outside the grid | V-004, V-005, V-019 |
| `#N/A` | The field is missing | — |
| `#VALUE!` | A value is not of the domain, or an argument has the wrong kind | V-007 |
| `#NAME?` | The domain does not declare the op | V-008 |
| `#NUM!` | A result is not a finite number (one explicit policy) | V-017, V-018 |
| `#CALC!` | The op threw an exception, or gave `undefined` | V-009, V-022 |
| `#ARGS` | More than one argument failed (the errors are collected) | — |
| `#CYCLE!` | A cycle in `sheet()` | — |

- Each error has the path of its IR node, the origin and the focus.
- Arguments are evaluated applicatively, so the trace shows all failed arguments, not only the first one.
- `explain(k)` gives one event for each IR node: the node, the focus, the reads (key, path, success) and the result. `explainAll()` adds counters in the style of `EXPLAIN ANALYZE`: "7 of 10 keys failed at node 3 (`#N/A` on `size`)".
- The trace is the keystone. The golden tests, the step debugger, the "why none?" pages and the conformance matrix all read the same JSON.

### 6.8 Semantics in one table

| Situation | Result |
|---|---|
| An error in a node | The error goes up the tree. The first error on a path is final. |
| A `let` binding that fails | The binding holds the error. It has an effect only if a `var` reads it. |
| An aggregation over an axis | Lenient by default (skip errors, but count them). `.strict()` makes any error the result. |
| `#N/A` and the other codes | Values that the program can catch with `ifError(expr, fallback)`, like Excel `IFERROR` |

There is no step-level strict mode. A failed value is gone, so step-level leniency has no meaning. This removes the inconsistent strict table (V-013, V-015).

### 6.9 Interpreters as folds over one IR

The IR is an open union: each extension adds an `ext` kind and a handler. The core gives these folds:

| Fold | Gives | Used by |
|---|---|---|
| `evaluate` | `Result<T>` | the public API |
| `explain` | a trace | tests, site, error pages |
| `deps` | the set of (address, path) reads | memoization, `render` seats, Graph `computed()` |
| `serialize` / `parse` | JSON | storage, workers, share links on the site |
| `pretty` | builder code from an IR | the site, error messages |
| `compile` | a closure, for speed | the hot path (checked against `evaluate` by property tests) |

### 6.10 Old API to new API

| Old | New |
|---|---|
| `.prop(p)` | `.from(p)` → `ref([p])` |
| `._.op(args)` | `._.op(args)`, typed → `app(op, [cur, ...args])` |
| `.self(k)`, `.other(k)` | `.at(k)`, `.other()` → addresses on references |
| `.self()` | `.origin()` (V-040 fixed) |
| `localSetConst/Prop/Of/Expr(n, …)` | `.let({ n: lit(v) \| field(p) \| of(k, p) \| expr })` |
| `localSetLens/Optic/PeerOptic` | `.let({ n: field("a.b") \| of(k, "a.b") })` |
| `localSetNDV*`, `localSetNDVFromPeers` | `.let({ n: NDVec.from(rec({ x: of("B1", "p.x"), … })) })` |
| `applyUsing(op, names)` | `._.op(v("a"), v("b"))`, or `.apply(op)` that binds by parameter names |
| `localRename/Remove/Project/Merge/Clear/Require` | removed (they had no effect, V-006) |
| `traverse(expr)`, `traverseStrict` | `.all(expr)`, and `.strict()` on the result |
| `peers(expr)` (missing) | `.others(expr)` with origin and target semantics |
| `fork(…)`, `MultiChain` | `.fork(e1, e2)` → a typed tuple (cheap with a tree IR) |
| `createDSL(adapter)`, `vectorMapChain(map)` | `vex(domain).over(space.record(map))` |
| `reduceBy(op)` | `.reduce(op)` through the domain, with tree reduction for associative ops |
| `applyPartial` | removed, or an extension if a user needs it |

### 6.11 Packages

```
packages/
  core/      @vex/core     — Result/Optional, IR, spaces, axes, domains, interpreter, folds, typed builder. No runtime dependencies.
  domains/   @vex/domains  — vec2, ndvector (+ the NDV typed view), color, angle. Subpath exports.
  testkit/   @vex/testkit  — fast-check arbitraries, law checker, reference interpreter, conformance runner
  legacy/    @vex/legacy   — the old code, moved without changes during P0. Deleted at the end of P2.
  site/      @vex/site     — the docs and the Lab (private)
  cli/       @vex/cli      — from the template. Later: `vex run program.json`, `vex explain`.
spec/                      — the v1.0 spec with requirement IDs, the cases and their ledger
```

### 6.12 Relation to render and Graph

The tree IR keeps the door open in both directions:

- **render** can evaluate Vex expressions with its own engine, because `lit`, `ref` and `app` are the same. Vex adds the domain op pack, the axes and the laws. `deps()` feeds render's seats.
- **Graph** stores its expressions as JSON in its database. A Vex expression is also JSON. The pilot in P5 replaces one Graph layout strategy (the grid or the packed layout) with a Vex program, and compares the output and the speed.
- **One Optional for the family.** Use the `render` form (`{ tag: "none" } | { tag: "some", value }`, with one shared `none`). Give a converter to Graph's `NotFound` form.

---

## 7. Migration to the template monorepo

### 7.1 Facts that set the approach

- The template is at `d59e2aa` (2026-10-08 13:06). It already has ste-lint, the STE `CLAUDE.md`, `ste.config.json` and a CI workflow. Thus requests 1 and 3 are mostly one step.
- `lag` does not come from the template. It is older, and it has its own copy of the presets and a `dist` build. The real template child is `mark1russell7.github.io`. Use github.io as the model for the structure. Use lag as the model for the site and for test depth.
- `new-repo.ps1` cannot make `~/git/vex`, because the file system does not see case, and `~/git/Vex` exists. Also, the script starts a new history. Keep the Vex history: it is the evidence for §3.
- The template has a rename command: `pnpm template rename <scope>`. It changes `template-monorepo` and `@template/` in each `package.json` and source file.

**Approach: convert in place.** Copy the template files into the repo, and rename the scope with the template command. Make packages with `pnpm package add`, and move the code with `git mv`. Git keeps the history of each file (`git log --follow`).

### 7.2 Procedure

```powershell
git switch -c chore/monorepo

# 1. The template files (the same exclusions as new-repo.ps1). Keep LICENSE and README.md.
robocopy "$HOME\git\template" . /E /XD .git node_modules _db .claude /XF pnpm-lock.yaml
git rm package-lock.json tsconfig.json out.txt test.out.txt "commands ie. update-submodules.txt" dsl/Vex.code-workspace

# 2. Scope "template" -> "vex" (root: vex-monorepo, cli: @vex/cli)
pnpm install
pnpm template rename vex

# 3. One package for the old code, moved without changes
pnpm package add legacy --preset=ts
git mv dsl math monads algebra brand.ts optional.utils.ts packages/legacy/src/
git mv tests packages/legacy/src/tests

# 4. Funk: keep the two files that Vex uses, then remove both submodules.
#    optional.ts and either.ts are byte-identical at the pin (69fa9c9) and at the upstream HEAD (9c4c93a).
mkdir packages/legacy/src/funk
cp external/Funk/optional/optional.ts external/Funk/optional/either.ts packages/legacy/src/funk/
git submodule deinit -f external/Funk external/concat-src
git rm -f external/Funk external/concat-src

# 5. Mechanical changes, with a script and no logic changes:
#    import paths into ../funk/*.ts, ".ts" on approximately 173 relative imports,
#    "import type" in 22 places, "override" in 6 places
pnpm typecheck
pnpm test        # the gate: the 20 old tests stay green
```

Step 4 also removes the problem of the uncommitted `.gitmodules` change (V-035). The SSH host alias `github.com-personal` in Funk's own nested submodule stops being a CI risk.

### 7.3 TypeScript settings

| Package | Preset | Overrides |
|---|---|---|
| `legacy` | `ts` | For a short time only: `isolatedDeclarations: false`, `exactOptionalPropertyTypes: false`. The package exists only until the new core reaches parity. Do not spend days on code that the plan deletes. |
| `core`, `domains`, `testkit` | `ts` | None. The full strict preset applies from the first commit. |
| `site` | `react` | `composite: false`, `incremental: false`, like the github.io site. TypeScript 6.0.3 for the docs tools (§10.5). |

### 7.4 Template gaps (fix them in Vex, and upstream in the template)

| # | Gap | Effect | Fix |
|---|---|---|---|
| T1 | TS 7 sets `types` to `[]` by default, and neither the generated `tsconfig.json` nor cue `node.json` sets it | A new `node` package fails `tsc` at its first `node:*` import | `"types": ["node"]` in cue `node.json` |
| T2 | An import from one workspace package into the `src` of another fails with TS6059 and TS6307 | `@vex/domains` cannot import `@vex/core`. No template child has tried this. | Short term: `composite: false` and a wider `rootDir` in each consumer. Long term: one decision in the template for "source packages" or for references with `dist`. |
| T3 | cue `lib.json` excludes `*.test.ts`, and the template has no `tsconfig.test.json` | Tests are not type-checked. Half of the Vex test plan is type tests. | Add `tsconfig.test.json` (the lag pattern) and check it in `typecheck` |
| T4 | cue `base.json` sets `diagnostics: true` | Each `tsc` run prints memory statistics | Remove it, as lag did |
| T5 | The template `.gitignore` has a Python block that ignores each folder named `lib/`, `build/`, `env/` or `var/` | A future `packages/site/build/` folder is ignored without a warning | Anchor or remove the block |

### 7.5 Dependency update

Vex has no runtime dependencies. The update is the move to the template toolchain, plus the new test and site tools. Versions were checked live on 2026-10-08. Use the versions that `pnpm install` resolves on the day of the migration.

| Item | At this time | After P0 |
|---|---|---|
| Package manager | npm, `package-lock.json` | pnpm 12.10.1 |
| Node | not set. The local machine has 25.2.1, which reached end of life on 2026-06-01. | `engines >=22.12`. CI on 22, 24 and 26. Install 24 locally (26 becomes LTS on 2026-10-28). |
| TypeScript | 5.6.3 installed but not declared (V-030) | 7.0.2. Tools that need the TS compiler API (twoslash, TypeDoc, TSTyche) use 6.0.3 in their own package. |
| Vitest | 3.2.4, watch mode as `test` (V-031) | 5.0.3 with `vitest run`. Note: `clearMocks` is on by default, and an async assertion without `await` fails. |
| Modules | CommonJS by default, `bundler` resolution | `"type": "module"`, `nodenext`, `verbatimModuleSyntax` |
| Funk | git submodule with an SSH URL | two vendored files, no submodules |
| New tools | — | `fast-check` 4.10, `@fast-check/vitest` 0.5, `@vitest/coverage-v8` 5.0, `oxlint` 1.87 with type-aware rules, TSTyche 7.2, Stryker 10 (on its own Vitest 4.1 lane, refer to §8.6) |
| Later (P5) | — | tsdown 0.23 for builds, Changesets 3, npm trusted publishing |

**Code lint.** The family has no code linter at this time. Vex needs one: the July audit found 106 `as any` casts. Oxlint 1.87 runs type-aware rules on TS 7, with the full `no-unsafe-*` family. typescript-eslint does not support TS 7. Use Oxlint as the gate, and offer it to the template later.

### 7.6 ste-lint integration

The template at `d59e2aa` already has the parts of the lag and github.io recipe:

- the root dependency `github:mark1russell7/ste-lint` and the `lint:ste` script
- `ste.config.json`
- the `.gitignore` block for the copyrighted dictionary
- the CI step

Vex adds these items:

1. **Scope.** Add `docs/**/*.{md,mdx}` and `packages/site/content/**/*.{md,mdx}` to `include`, as lag does.
2. **The spec.** STE does not permit `should`, `may` or `would`. The spec uses RFC 2119 words. Write the v1.0 spec in the indicative ("The evaluator gives `#REF!`"), and give each normative sentence a requirement ID (§8.2). The ID carries the force, not a modal verb.
3. **Glossary.** Add the Vex terms to `technicalNouns`: Optional, traversal, monoid, adapter, lens, optic, comonad, zipper, axis, origin, focus.
4. **Baseline.** 325 of the 456 findings are in the July audit files, and 107 are in the README spec. Both get a rewrite in the plan. Move the July files to `docs/archive/`, and add `docs/archive/**` and `docs/research/**` to `ignore`. Do not correct them line by line.
5. **`CLAUDE.md`.** Merge the template version with the Vex rules: this review, the requirement IDs and the test commands.
6. **README.** Add the github.io sections "Writing style" and "Disclosure".

---

## 8. Testing strategy

### 8.1 The principle: the spec is code

The history in §3 has one root cause. Make three things into one thing:

1. Each normative sentence of the spec has a **requirement ID**, for example `AXIS.OTHERS.ORIGIN`.
2. Each requirement ID has **one or more tests** that name it.
3. The **site shows the spec** with a live status for each ID. A requirement without a test, or a test without a requirement, makes CI fail.

### 8.2 The layers

| # | Layer | Tool | What it proves | When |
|---|---|---|---|---|
| L1 | Unit | Vitest 5 | Each module does its job | each push |
| L2 | Conformance | Case files with typed metadata, a ledger of known failures (`test.fails`) | Each requirement ID holds. An unexpected pass also fails, so the ledger stays true. | each push |
| L3 | Doc tests | A small extractor writes each `ts` block of the docs and the spec to a test file | Each code sample compiles and gives the value that the text says | each push |
| L4 | Type tests | `expectTypeOf` on TS 7. TSTyche on TS 6 for negative cases that check the error text. | The typed surface accepts correct chains and rejects wrong ones | each push |
| L5 | Properties | fast-check 4.10 (§8.4) | Totality, purity, immutability, domain laws, axis laws | 200 runs on each push, 10,000 at night |
| L6 | Golden traces | `toMatchFileSnapshot` of `explain()` and of the IR | A change of semantics shows as a readable diff | each push |
| L7 | Differential | fast-check | `compile` equals `evaluate` equals a 100-line reference interpreter | each push |
| L8 | Package | `publint`, `@arethetypeswrong/cli`, `knip`, tests against the packed tarball | The packages are usable and have no dead exports | after P5 adds a build |
| L9 | Mutation | Stryker 10 on `@vex/core` | The tests find changes in the interpreter (target score 90, lag uses 95) | at night |
| L10 | Speed | Vitest bench with `toBeFasterThan` | Chain cost compared with hand-written code, type instantiation budgets | at night, report only |
| L11 | Site | Vitest browser mode with Playwright | Each route renders without `console.error`, and each widget runs its sample | each push |
| L12 | Prose | ste-lint | The STE rules | each push |

Coverage for `@vex/core` uses the lag thresholds: statements 98, branches 96, functions 98, lines 98.

### 8.3 A conformance case

```ts
// spec/cases/axes/others-origin.case.ts
export const meta = {
  id: "AXIS.OTHERS.ORIGIN",
  text: "In others(), the base evaluates at the origin and the body evaluates at each target.",
  spaces: ["record", "array"],          // the same data in each space kind
  expect: { value: 1 },
} as const satisfies CaseMeta;

export const run = (s: Fixture) =>
  vex(Vec2).over(s.space({ A, B, C, D }))
    .from("position")
    .others((e) => e._.subtract("position")._.length())
    .min()
    .at(s.key("A"));                    // spec example §18.2: no version passed it (V-042)
```

The runner finds all case files, runs each one in each space kind, and writes a JSON report. The site reads the report.

### 8.4 Properties

| ID | Property | Finds |
|---|---|---|
| P1 | **Totality.** A random program over random data does not throw. It always gives a `Result`. The data includes `__proto__`, `NaN`, throwing getters and null prototypes. | V-009, V-041, and each future throw path |
| P2 | **Purity.** Two runs give equal results, and runs in any order do not change each other. | the shared focus (V-004, V-010) |
| P3 | **Immutability.** Random builder calls (`fc.commands`) against a model array. Earlier chains do not change. | V-010 |
| P4 | **Domain laws.** Each declared law holds for random values, with a tolerance for floats. | V-016 |
| P5 | **Axis laws.** The comonad laws, `others` plus the origin equals `all`, `other` twice equals the origin, and spec Appendix A. | errors in the axis semantics |
| P6 | **Round trip.** `parse(serialize(e))` equals `e`, and `pretty` then build gives the same IR. | serialization drift |
| P7 | **Reduction.** For an associative op, a random reduction tree equals the left fold. | false `associative` claims |
| P8 | **Honest errors.** The error code agrees with the reference interpreter. | wrong explanations |

CI makes a random seed for each run, prints it and applies it. A failure in CI can thus be replayed. Each counterexample becomes a fixed test.

`@vex/testkit` publishes the arbitraries and the law checker. An author of a new domain adds one line: `checkLaws(MyDomain, arbMyValue)`.

### 8.5 The regression suite

Each defect from V-001 to V-042 gets one test that names its ID. The July audit wrote 12 of these tests "inverted" (green means the bug exists) and then deleted them. Write them again with the correct assertion. On the new core they pass. On `legacy` they run as `test.fails` until the package goes away.

### 8.6 Known tool problems

- Stryker 10 gives false scores near zero with Vitest 5 (stryker-js issue 6210). Run mutation tests from `tools/mutation` with Vitest 4.1.11 until the fix ships.
- The docs tools that need the TypeScript compiler API (twoslash, TypeDoc, `@typescript/vfs`, TSTyche) do not work on TS 7.0. TS 7.1, planned for 2026-11-24, adds an API. Pin TS 6.0.3 in those packages until then.
- A `@ts-expect-error` line passes for any error, also a typo. For negative type tests, use TSTyche, which checks the error text.

---

## 9. CI and release

### 9.1 Workflows

| File | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push, pull request | `check`: install, typecheck (source and tests), Oxlint, tests with coverage, type tests, doc tests, ste-lint. `site`: build, browser smoke test. `ci-ok`: one aggregate job, the only check that must pass. |
| `pages.yml` | push to `main` | Build the site with `SITE_BASE`, upload, deploy. Copy the github.io workflow. |
| `nightly.yml` | schedule | fast-check with 10,000 runs, Stryker, benchmarks, `typescript@next`, a link check. The site reads the reports, as the lag results page does. |
| `release.yml` | P5 | Changesets, npm publish with trusted publishing (OIDC) and provenance. Since 2026-09-03, a new trusted publisher permits only staged publishing by default. Changesets cannot stage at this time, so set direct publishing. |

### 9.2 Sketch of `ci.yml`

```yaml
name: CI
on:
  push:
  pull_request:
permissions: {}
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions: { contents: read }
    strategy:
      matrix: { node: [22, 24, 26] }
    steps:
      - uses: actions/checkout@v7
        with: { persist-credentials: false }
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version: "${{ matrix.node }}", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:coverage
      - run: pnpm test:types
      - run: pnpm test:docs
      - run: pnpm lint:ste
  site:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v7
        with: { persist-credentials: false }
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version: 26, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @vex/site exec playwright install --with-deps chromium
      - run: pnpm --filter @vex/site test
      - run: pnpm --filter @vex/site build
  ci-ok:
    if: always()
    needs: [check, site]
    runs-on: ubuntu-latest
    steps:
      - run: test "${{ contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled') }}" = "false"
```

Pin each action by its commit SHA, and let Renovate keep the pins current. Renovate supports pnpm 12 catalogs. Dependabot does not support them officially.

The research report [`docs/research/05-tooling-testing-docs.md`](./research/05-tooling-testing-docs.md) has the full workflow files with SHA pins (§B.12): CI, release, Pages, security (CodeQL, zizmor, Scorecard), and a Renovate configuration. It also has the one-time repository settings (§B.14) and the first-publish checklist for npm (§B.13).

### 9.3 Repository settings (the owner does these)

- Settings → Pages → Source: "GitHub Actions". Pages is off at this time.
- A ruleset on `main`: pull requests only, `ci-ok` must pass, no force-push.
- Optional: rename the repository from `Vex` to `vex`. The site path is the repository name, and all other family names are lowercase. GitHub keeps a redirect.

---

## 10. The site: "Vex Lab"

### 10.1 The idea

The lag site shows live data from the real library. The Vex site goes one step more: **the reader changes the data, and every program on the page answers.**

- **One specimen set.** A small set of boxes (A, B, C, D, with position, size and color) sits on graph paper on every page. The reader can drag a box. Each example on the page evaluates again against the moved box. One dataset, learned deeply, makes the abstract parts concrete.
- **The spreadsheet as the main metaphor.** Rows are keys, columns are fields, and a Vex program is a computed column. `all()` fills it down. References show as arrows, and an error shows as `#REF!` in its cell.
- **The family look.** Use the lag tokens: "ink on graph paper", hairlines, blue ink for links, red pencil for errors, Atkinson Hyperlegible fonts. Keep the lag accessibility rules. Each chart has a data table, and each diagram has its source. Motion stops when the reader asks for reduced motion.
- **The origin story as the first page.** The first page shows layout boxes on graph paper. A Vex program tests their separation. Drag a box: the separation vectors change, and a collision turns red.

### 10.2 Site map

| Section | Contents |
|---|---|
| **Learn** | "A Tour of Vex" (20 short lessons, each adds one call to a chain), concepts, guides, the error index "Why none?" |
| **Lab** | The full playground: editor, result, trace, IR as JSON, IR as a graph, types |
| **Spec** | The living spec: each requirement with its status, a "Run" button and the golden trace |
| **Reference** | The API (TypeDoc), the ops of each domain, "Vexle" search by signature and by law |
| **Gallery** | Layout separation, Game of Life on a grid, color mixing, the Graph layout pilot |
| **Ideas** | The theory, as interactive essays: "Vex is a spreadsheet", "Axes are relations", "Why the laws matter" |

### 10.3 The signature pieces

| # | Piece | What the reader sees | Needs |
|---|---|---|---|
| 1 | **Chain stepper** | The space laid out as a record, an array or a grid. A spotlight moves to each read. Arrows go from the read fields into the current value. Each IR node has a badge: a value or an error code. Step, scrub and reset. Used on every page. | `explain()` |
| 2 | **"Why none?" index** | One page for each error code, with an animated minimal case and the fix. A grid of IR nodes against keys outlines the first error in red, like J's "Dissect". | `explain()` |
| 3 | **Spreadsheet view** | The Excel "Trace Precedents" idea: blue arrows for good reads, red arrows on the path to an error. "Evaluate Formula" steps through one node at a time. | `explain()` |
| 4 | **Axes as relations** | A K × K matrix next to the canvas. Choose `all`, `others`, `other`, `pairs` or `neighbors`, and the related cells light. Click a cell to see the body evaluated with that origin and target. | axes |
| 5 | **Living spec** | Each requirement has a chip (pass, known failure, fail) from the CI report, a "Run" button and the golden trace. | conformance report |
| 6 | **Optional rail** | A two-track drawing made from the trace. A token rides the "value" track and changes to the "error" track at a labeled point. A switch shows lenient and strict aggregation. | `explain()` |
| 7 | **Tour that grows the chain** | Each lesson adds one call, and the stage changes at once (the Hydra and Gleam tour style). A "solve" button. | builder |
| 8 | **Law arena** | The `@vex/testkit` properties run in a browser worker. The arena shows a counterexample and animates the shrinking. The first exercise: find the false `commutative` claim on `Color.add`. | testkit |
| 9 | **The Lab** | CodeMirror 6 with a TS 6 language service in a worker, the state in the URL, panes for result, trace, IR and types, and "export as test", which writes a Vitest file with the golden trace | typed builder |
| 10 | **Cursor view** | In the Lab, the caret position shows the space, the focus, the bindings, the value and the calls that are legal next (the Lean InfoView idea) | Lab |
| 11 | **Domain workshop** | Write a small class (for example complex numbers), declare its ops and laws, get a typed chain at once, and let the law arena test the claims | Lab, testkit |
| 12 | **Game of Life** | A grid space and `neighbors(8)`. One Vex program is the rule. Draw cells and watch the generations. It shows the comonad idea without a formula. | grid axes |
| 13 | **Vex Diner** | Puzzle levels in the style of CSS Diner: "focus the right box", "sum the sizes of the others", with a par and shareable levels | stepper |
| 14 | **Hover types** | Build-time twoslash on every code block shows the type after each call. The build fails on an unexpected type error. | TS 6 pin |

The research report [`docs/research/05-tooling-testing-docs.md`](./research/05-tooling-testing-docs.md) §C.5 has 24 ideas, each with its effort and its prerequisites. Its §C.1 lists the examples that each idea copies.

### 10.4 Technology choice

| Option | For | Against |
|---|---|---|
| **A. Astro 7 + Starlight 0.42 with React islands** (recommended) | Pages are static and searchable (Pagefind is built in). The text sends no JavaScript. Expressive Code, the sidebar and TypeDoc come ready. effect.website uses the same stack for heavy interactive TypeScript docs. | A different stack from lag. Astro 7's markdown processor needs a setting for remark plugins. Restyle Starlight with the lag tokens. |
| **B. The lag shell** (Vite + React 19 + MDX 3, a custom single-page app) | The family stack. The shell, theme, components, smoke tests and Pages workflow exist and work. | Search, code highlighting, type hovers and the API reference must be built. The route HTML files are empty shells, so search needs prerendering. |

Option A gives more of what Vex needs (search, code, API reference) with less custom work. The widgets are React components in both options. Thus a later move from one option to the other is not expensive.

### 10.5 Constraints that shape the site

- **TypeScript.** twoslash, TypeDoc, `@typescript/vfs` and `astro check` need the TS 6 compiler API. The site package pins `typescript@6.0.3` through its own catalog. The library stays on 7.0.2.
- **GitHub Pages cannot set headers.** Thus `SharedArrayBuffer` features (WebContainers, the oxc wasm build) are not available. User code runs in a module Worker with a time limit. `worker.terminate()` stops an endless loop, and the trace shows the stop.
- **Type stripping in the browser.** `ts-blank-space` keeps exact positions, so each trace event maps to the editor range of its call.
- **Share links.** The Lab state goes into the URL fragment, compressed with `CompressionStream`.
- **Base path.** The site path is `/Vex/` (or `/vex/` after a rename).

### 10.6 Build order

1. **D0, with P0 and P1:** the skeleton on Pages, the family theme, the spec pages, static railroad diagrams of the grammar, the TypeDoc reference.
2. **D1, after `explain()`:** pieces 1, 2, 3, 5 and 6, and golden traces in CI. These give the most value for each day of work.
3. **D2, after the typed builder:** pieces 7, 9, 10 and 14.
4. **D3, after the axes and the testkit:** pieces 4, 8, 11, 12 and 13.

---

## 11. Roadmap

| Phase | Deliverables | Done when | Effort |
|---|---|---|---|
| **P0 Migrate** | §7: template files, rename, `legacy` package, Funk vendored, submodules removed, the template gap fixes T1–T5, ste-lint, Oxlint, CI, Pages on, the site skeleton (D0) | A new clone passes `pnpm install`, `pnpm typecheck`, `pnpm test` and `pnpm lint:ste`. CI is green. The skeleton is live. | 1–2 days |
| **P1 Kernel** | `@vex/core`: Result and Optional, the tree IR, spaces and addresses, `defineDomain`, `evaluate`, `explain`, `deps`, JSON round trip, list ops. `@vex/testkit`: arbitraries and the reference interpreter. | Properties P1, P2, P5, P6 and P8 pass. The interpreter has no `any`. The trace JSON schema is fixed. | 2 weeks |
| **P2 Surface** | The typed builder, `all`, `others`, `other`, `pairs`, `neighbors`, `fork`, `let`, `rec`, `ifError`. `@vex/domains` with Vec2, NDVector and NDV, Color and Angle. The old tests ported. `legacy` deleted. | All 42 regression tests pass. Spec examples §18.1 to §18.3 pass. The type tests pass. `legacy` is gone. | 2 weeks |
| **P3 Assurance** | Conformance cases for each requirement ID, doc tests, the full property suite, TSTyche, golden traces, the Stryker lane, benchmarks | Each requirement has a test. Mutation score of 90 or more on the core. | parallel to P1–P2 |
| **P4 Site** | D1, D2 and D3 from §10.6 | Each page passes the smoke test and ste-lint. The Lab runs each spec example. | 3–6 weeks, parallel |
| **P5 Interop** | `sheet()` with `#CYCLE!`, `compile`, the Graph layout pilot, a shared Optional package, tsdown build, Changesets, npm release as `@mark1russell7/vex` | The pilot gives the same layout as the Graph code. The package passes publint and attw. | 2–3 weeks |

**The first two weeks, in order:**

1. P0 complete (days 1–2).
2. The Result type, the IR, spaces and addresses, the interpreter with `explain` (days 3–6).
3. `defineDomain` with Vec2, and the first 40 conformance cases (days 7–8).
4. The typed builder for the pipeline axis, then `all` and `others` (days 9–10).

---

## 12. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | **The role of Vex.** A standalone library, or a part of `render`, or an archive? | A standalone library that interoperates with render and Graph through the shared tree IR. Give it a real consumer: a Graph layout strategy (P5 pilot). If Graph does not want peer-relative math as data, decide again after P2. |
| D2 | The IR shape | The tree IR of §6.4, a superset of render's `Lit \| Ref \| App` |
| D3 | The main surface | The typed `._` chain with `let`. `applyUsing` stays only as sugar that binds arguments by name. |
| D4 | `fork()` | Keep it. With a tree IR it is a typed tuple of expressions and costs little. |
| D5 | Optional encoding | The render form for Vex 1.0. Later, one shared package for Vex, render and Graph. Retire the Funk submodule in P0. |
| D6 | Docs stack | Option A, Astro + Starlight with the lag tokens (§10.4) |
| D7 | Code lint | Oxlint with type-aware rules. Offer it to the template after Vex proves it. |
| D8 | Package name | `@vex/*` inside the workspace, published as `@mark1russell7/vex` in P5. The unscoped `vex` name is taken on npm. |
| D9 | Repository name | Rename `Vex` to `vex` |
| D10 | ste-lint and the spec | Write the spec in STE with requirement IDs. Do not exempt it. |
| D11 | Template gaps T1–T5 | Fix them upstream in `template` and `cue` during P0 |
| D12 | Scaffolding rules | The workspace `CLAUDE.md` says to use `lib new` and `cue-config`. Template monorepos use `pnpm package add`. State in the workspace `CLAUDE.md` which rule applies where. |

---

## 13. Other observations

- **Node.** The local Node 25.2.1 reached end of life on 2026-06-01. Vitest 5, tsdown 0.23 and Changesets 3 do not support it. Change to Node 24 at this time, and to 26 after 2026-10-28.
- **An unpushed branch in render.** The as-built state of `render` (its whole roadmap run) is on the local branch `roadmap`, which is not on GitHub. Push it, or a disk failure loses it.
- **One vector library.** The same vector code exists three times (Jqy/Vex, render, Graph). `@vex/domains` can become its single home.
- **One Optional.** Four Optional encodings exist in the family. A tiny shared package removes the converters.
- **Jqy.** Its `dump:src` script points to a folder that does not exist, and its `concat-src` submodule is not initialized.
- **lag** tracks `.claude/settings.local.json`, but the template ignores the `.claude/` folder. This is a small difference to clean up.
- **AI readers.** Publish an `llms.txt` and the JSON schema of the IR on the site. A model can then write Vex programs as data, and `explain()` can check them.
- **Later ideas.** A tree space with `parent`, `children` and `ancestors` axes (Graph's `$ancestor`). A solver hand-off for linear constraints (Cassowary or kiwi). Law-based rewrites of the IR, for example constant folding for associative ops.

---

## 14. Execution record

*Updated: 2026-10-12.* This section records what the work did, and where the work is different from the plan.

### 14.1 Status of the phases

| Phase | Status | Evidence |
|---|---|---|
| P0 Migrate | Done | Commit `890e6a3`. CI is green on Node 22, 24 and 26. |
| P1 Kernel | Done | Commit `0357f95` |
| P2 Surface | Done | Commits `749a3e1` and `1c9a17a`. `@vex/legacy` is gone. |
| P3 Assurance | Done, with the changes of §14.2 | Commits `7e76f54`, `84234e8`, `b815206` and `26d9b7f`. The mutation score is 99.0 %. |
| P4 Site | Done | Commits `89161c6`, `a1c7cfe` and `643aaa8`. The site is live at [mark1russell7.github.io/vex](https://mark1russell7.github.io/vex/). |
| P5 Interop | Done, except the items of the owner (§14.4) | Commits `b815206` (build, release), `d3be6d7` (sheets, pilot) and `6eff59c` (`compile`) |

### 14.2 Changes to the plan

| Plan | What the work did | Reason |
|---|---|---|
| §6.2: the builder simplifies addresses, for example `other` twice is empty | The builder keeps each move. | A simplification hides errors. In a space with three keys, `[other, other]` gives `#REF!`, but the empty address gives a value. |
| §8.2 L2: case files and a ledger | Each test title names its requirement IDs. `spec-coverage.test.ts` checks that each ID has a test, and that each ID of a test is in the spec. | The test titles do the same job with less code. |
| §8.2 L3: doc tests | A code block with the meta word `doctest` is a test. `// =>` compares a value, `// :` compares a type, and `// type error` adds `@ts-expect-error`. | The doc tests found a defect in the README sample: it gave the class `Vec2` where the domain `Vec2Domain` is necessary. |
| §8.2 L4: TSTyche for negative type tests | The lines with `// type error` in the doc tests, and `expectTypeOf` in the unit tests | TSTyche needs the compiler API, and TS 7.0 has no compiler API. |
| §8.2 L6: golden traces | `formatTrace` gives a text form of a trace. Four programs have a golden IR file and a golden trace file. | None |
| §8.6: Stryker in `tools/mutation` with Vitest 4.1 | The same, and the lane copies the sources to `tools/mutation/work/` first. | The Vitest runner of Stryker loads the Vitest of its working folder. At the root, that Vitest is version 5, and the scores are false. |
| §8.2 L1: coverage of `@vex/core` | The root `vitest.config.ts` starts the tests of three packages and measures `@vex/core`. | The property tests of `@vex/testkit` find many paths of the core. |

### 14.3 Measurements

- Coverage of `@vex/core`: 100 % of the statements, branches, functions and lines. The thresholds are 98, 96, 98 and 98.
- Mutation score of `@vex/core`: 99.0 %. The tests found 2048 mutants, 18 mutants timed out, and 20 mutants survived. The nightly workflow fails under 95 %. The score was 90.7 % before the contract tests.
- The error catalog (`__golden__/errors.txt`) found three defects. An extension error had no location, a `where` test had the wrong focus, and an offset message had bad grammar. The fixes added the spec rule EVAL.LOCATION.
- Speed with 60 boxes, measured on one machine: the closure compiler made the nearest-box program 2.0 times faster. It is approximately 17 times slower than hand-written loops (36 times before). One step of the Game of Life on a 16 by 16 grid is 2.1 times faster. It is approximately 36 times slower than hand-written loops (73 times before).
- Tests: 438 unit and property tests, 25 doc tests and 127 browser tests. The browser tests include axe-core on each page in two themes, and a size budget.

### 14.4 Open items

- P5 done: the tsdown build, the package check (publint, attw and a program against the tarballs), Changesets, and a release workflow that the owner starts by hand.
- P5 done: `sheet()` with `#CYCLE!` (spec §9). A cell reference is an `ext` node, so the IR has no new kind. The run uses the algorithm of Tarjan, so each cell on a cycle gives `#CYCLE!` in any order of evaluation (property P9).
- P5 done: the grid pilot in `@vex/pilots`. One Vex program gives the same rectangles as the grid layout of Graph on random items. Graph is a private repository, so the pilot compares with a new implementation of the same behavior, not with a copy of the Graph code. The owner can do the direct comparison in a local copy.
- P5 done: `compile`. The interpreter is a closure compiler, so `evaluate` and `compile` have one semantics (spec rule EVAL.COMPILE, property P10).
- §13 done: the site publishes `llms.txt` and the JSON Schema of the IR. A property test keeps the schema equal to `isExpr`.
- §9.2 done: each workflow uses actions by commit SHA. `.github/renovate.json` keeps the pins current, after the owner installs the Renovate app.
- The packed layout of Graph is an ordered fold. It is not a good fit for Vex formulas.
- §13 done: the tree space, with the move `parent` and the axes `children`, `ancestors`, `descendants` and `siblings` (spec SPACE.TREE, NAV.PARENT, AXIS.TREE and EXAMPLE.TREE, property P11). The site has a tree explorer.
- Not done, on purpose: a cache of methods for each prototype. A prototype can change after the first lookup, and then a cache gives an old method. The gain was 11 % of the time of a call.
- Not done: one vector library for the family. render and Graph keep their own vector code until `@mark1russell7/vex-domains` is on npm. A change of Graph is a decision of its owner.
- 2026-10-18: the owner of Graph accepted a plan that moves the packer classes `Vector` and `Rect` of Graph to `render-pack`, not to `vex-domains`. They are the same code as the packer of `render-pack`. Thus the family keeps two copies: the mutable geometry of the packer in `render-pack`, and `Vec2` in `vex-domains`. When 0.7.0 is on npm, Graph removes its own `vec`, `vec.x` and `vec.y`.
- D5 done: the shared Optional is the new repository [`optional`](https://github.com/mark1russell7/optional). render gives its exports from `@render/optional`, and the type `Optional` of Vex is its type. Graph keeps its sentinel form, and the package has converters for it.
- D8 done: the published names are `@mark1russell7/vex`, `@mark1russell7/vex-domains` and `@mark1russell7/vex-testkit`, and the packages are not private. Version 0.2.0 is on npm. Each package trusts the release workflow (trusted publishing), so the workflow has no token.
- D11 done: cue (`9c99ad6`) sets `types` in the node preset and removes `diagnostics`. The template (`aac1840`) makes source packages with a `tsconfig.test.json`, and anchors the Python block of `.gitignore`.
- D12 done: the workspace `CLAUDE.md` tells which scaffolding rule applies in `client` and which in a template monorepo.
- D9 done: the owner renamed the repository to `mark1russell7/vex`. The site base is `/vex/`.
- §13 done: the local Node is 24 (LTS). Jqy's `dump:src` works, and lag does not track `.claude/settings.local.json`. render's `roadmap` branch was already in `main`.
- The research reports in `docs/research/` are in the repository, without local paths and without details of private repositories. The lineage report (03) is mostly about private repositories, so it stays local, and its links in this document work only in a local copy.
- Polish done: `withOptions({ fns })` gives the types of the free functions to the chain. `call(name, ...args)` applies one with type checks (spec BUILD.CALL and TYPE.CALL).
- Polish done: `sheet().declare<T>()` gives types to a column that reads itself or a later column (spec SHEET.DECLARE).
- Polish done: the root `vitest.config.ts` measures the three published packages. Each package has the gates 98, 96, 98 and 98.
- Polish done: the mutation lane fails under 95 %. The contract tests (`contracts.test.ts`) check the exact messages and the inputs at the edges.
- Site done: axe-core checks each page in the light and the dark theme with the rules of WCAG 2.1 AA. Each page loads 256 kB gzip or less.
- Site done: the home page has a live hero, a showcase of the interactive pages, and a sample for your code. The README shows a recording of the hero.
- Site done: the Lab reads typed chains with a safe reader, in four spaces. The editor highlights the code and marks the position of an error.
- Owner items: the Renovate app, Google Search Console, and the social preview image of the repository (`packages/site/public/og.png`).
- V-043 fixed: the moves before an axis are its address. The Jqy audit found the defect, and the pilot `layout-audit` keeps the checks.
- The plan to zero defects is in [`QUALITY-PLAN.md`](./QUALITY-PLAN.md). The proposal of the sheet app is in [`SHEET-APP.md`](./SHEET-APP.md).
- Phase A of the plan to zero defects is done. It added the builder model test and the property P13 (five paths give one result). It also added the Lab reader against the builder, and `keys()` and `errors()` on a list chain. With the fix of V-043 removed, the builder model test fails at once. It also found V-044: `serialize` lost the class of a domain value with `toJSON`.
- The sheet app is live at `/vex/app/`. Its formula language is in `@vex/formula` (spec `spec/formula.md`), and the text values use the new `TextDomain`.
- Done in 0.4.0: the key `$vex` in a JSON literal has an escape (IR.JSON.ESCAPE). The nightly run in CI gives the mutation scores of each package, and the gate is 95 %.
- Done in 0.5.0: Vex does not depend on the call stack of the engine. A `SheetRun` reads its cells from a work list, so a chain of 100000 cells gives its value (SHEET.DEEP). A property test compares it with the recursive search of `ReferenceSheetRun`, with small stack budgets. An expression can nest 500 levels deep (EVAL.NESTING). A full call stack in host code gives `#DEPTH!`, and `ifError` does not hide it (EVAL.DEPTH, V-050).
- Done after 0.5.0: in the sheet app, a formula reads a row by its name (FORMULA.NAV.NAME), and seven new examples have formulas that read formulas. The app draws a chart: a line for a column of numbers, and a path for a column of vectors.
- Done after 0.5.0: a cell can have its own formula (SHEET.CELL.FORMULA). `SheetRun` takes the formulas of cells, the builder has `cellFormula`, and the property test of the scheduler gives random sheets formulas of cells.
- Done after 0.5.0: the axis `window(from, to)` (AXIS.WINDOW), and the axis `table(name)` with a `SheetRun` over more tables (AXIS.TABLE, SHEET.TABLES). Graph spaces have the axes `successors`, `predecessors` and `reachable` (SPACE.GRAPH, AXIS.GRAPH). New properties check each one: P14, P15, P16 and a scheduler property over two tables.
- Done after 0.5.0: `DateDomain` with `LocalDate`, and `ln`, `exp`, `log10` and `date` in `NumDomain`.
- Done after 0.5.0: the formula language has `rows(from, to)`, the finance functions `PMT`, `FV`, `PV` and `NPER`, and the dates. It also has grids with A1 addresses and ranges, and `table("name")` (spec `formula.md` §6 to §8). `RATE`, `NPV` and `IRR` are not in it: they need a numeric search or the position of an item in a list.
- Done after 0.5.0: the sheet app has date columns, grids, and books of tables with tabs. Its examples show each feature.
- The compiler of Vex (tier 2: generated JavaScript, at run time and at build time) has its plan in [`COMPILER.md`](./COMPILER.md). Its first user is ireko. Phase C1 is done: `@mark1russell7/vex-compiler` gives the results of the interpreter (P17), 35 to 75 times faster than tier 1. Its record is in §13 of that plan.

---

## Appendix A: Evidence from this review

| Check | Result |
|---|---|
| String arguments with `pick` and `get` | `pick(["x","y"])` gives `none`, the direct call gives `{x:1,y:2}`. `get("x")` gives `none`. |
| Spec §18.1 through the `._` proxy | Works: gives `false` for two boxes that overlap |
| Spec §18.2 at this time | `TypeError: peers is not a function` |
| Spec §18.2 and §18.3 on v0 (`47e15ce`) | `[0,0,0]`, minimum `0`, and `(0,0)` |
| v0 import | `annotateOp: 'add' is not a function` |
| Focus after `traverse()` | It stays on the last key, and a later nested expression reads that key |
| `vectorExpr().build(VectorAdapter)` | Records an op named `build` with the adapter as a constant argument |
| `self()` after `other()` | No effect, so the next reference reads the other key |
| `await vectorExpr().add("size")` | Does not finish. The steps become `["add","then"]`. |
| `reduceBy("constructor")` | Throws through the API: "Class constructor NDVector cannot be invoked without 'new'" |
| `docs/spikes/typed-chain.ts` on TS 7.0.2 | 0 errors, 10 of 10 negative cases rejected, 1,833 instantiations, 0.02 s |
| `docs/spikes/store-laws.ts` | All comonad, Store and Vex laws hold on 2,000 random cases |
| The current suite | 20 of 20 tests pass in 4 s |

## Appendix B: Main sources

**Theory**

- Ahman, Chapman, Uustalu, "When is a container a comonad?", LMCS 10(3:14), 2014: <https://lmcs.episciences.org/894>
- The Store comonad interface: <https://hackage-content.haskell.org/package/comonad-5.0.10/docs/Control-Comonad-Store-Class.html>
- Piponi, cellular automata as comonads: <http://blog.sigfpe.com/2006/12/evaluating-cellular-automata-is.html>
- Orchard, Bolingbroke, Mycroft, Ypnos (a comonadic grid language): <https://www.cs.kent.ac.uk/people/staff/dao7/publ/ypnos-damp10.pdf>
- Huet, "The Zipper", JFP 1997: <https://doi.org/10.1017/S0956796897002864>
- Pickering, Gibbons, Wu, profunctor optics: <https://arxiv.org/abs/1703.10857>
- Gibbons, Wu, "Folding domain-specific languages": <https://www.cs.ox.ac.uk/jeremy.gibbons/publications/embedding.pdf>
- Oliveira, Cook, object algebras: <https://www.cs.utexas.edu/~wcook/Drafts/2012/ecoop2012.pdf>
- Mokhov, Mitchell, Peyton Jones, "Build Systems à la Carte": <https://www.microsoft.com/en-us/research/publication/build-systems-la-carte/>

**Spreadsheets, axes and errors**

- Excel formulas and R1C1 references: <https://support.microsoft.com/en-us/office/overview-of-formulas-in-excel-ecfdc708-9162-49e8-b993-c311f47ca173>
- Excel error values (`ERROR.TYPE`): <https://support.microsoft.com/en-us/office/error-type-function-10958677-7c8d-44f7-ae77-b9a9ee6eefaa>
- XPath 3.1 focus and axes: <https://www.w3.org/TR/xpath-31/>
- jQuery `.siblings()`: <https://api.jquery.com/siblings/>
- PostgreSQL window frames and `EXPLAIN ANALYZE`: <https://www.postgresql.org/docs/current/using-explain.html>
- Railway-oriented programming: <https://fsharpforfunandprofit.com/rop/>

**Typed builders and laws**

- tRPC recursive proxy: <https://trpc.io/blog/tinyrpc-client>
- Kysely type-state builder: <https://kysely.dev>
- Static Land: <https://github.com/fantasyland/static-land>
- fast-check model-based testing: <https://fast-check.dev/docs/advanced/model-based-testing/>
- fp-ts-laws: <https://github.com/gcanti/fp-ts-laws>
- Futhark reductions and laws: <https://futhark-lang.org/docs/prelude/doc/prelude/soacs.html>
- Halide `rfactor`: <https://halide-lang.org/docs/tutorial/lesson_18_parallel_associative_reductions.html>

**Tooling (versions checked 2026-10-08)**

- TypeScript 7.0: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
- Vitest 5: <https://vitest.dev/blog/vitest-5>
- pnpm 12: <https://pnpm.io/blog/releases/12.0>
- Oxlint type-aware linting: <https://oxc.rs/blog/2026-07-22-type-aware-linting-stable>
- Node release schedule: <https://github.com/nodejs/Release/blob/main/schedule.json>
- test262 conventions: <https://github.com/tc39/test262/blob/main/CONTRIBUTING.md>

**Interactive documentation**

- Bret Victor, "Learnable Programming": <https://worrydream.com/LearnableProgramming/>
- Red Blob Games: <https://www.redblobgames.com/>
- J "Dissect": <https://code.jsoftware.com/wiki/Vocabulary/Dissect>
- Excel formula auditing: <https://support.microsoft.com/en-us/office/display-the-relationships-between-formulas-and-cells-a59bef2b-3701-46bf-8ff1-d3518771d507>
- Visual Effect: <https://effect.kitlangton.com/>
- ArkType playground: <https://arktype.io/playground>
- Gleam language tour: <https://tour.gleam.run/>
- Learn Git Branching: <https://learngitbranching.js.org/>
- Astro Starlight: <https://starlight.astro.build/>
