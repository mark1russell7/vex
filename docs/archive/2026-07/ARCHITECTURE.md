# Vex — Architecture & Codebase Documentation

> **Update (2026-10-08).** [REVIEW.md](../../REVIEW.md) adds the history (v0 did not run; `peers()` was removed in `b95eddb`), the lineage (Jqy → Vex → render), five new defects (V-038 to V-042) and the target architecture.

*Audit date: 2026-07-11 · Baseline: `main` @ `f54ee88` · All 20 existing tests pass, `tsc --noEmit` clean.*

Companion documents: [BUGS.md](./BUGS.md) (verified defect catalog) · [ROADMAP.md](./ROADMAP.md) (prioritized plan).

---

## 1. What Vex Is

Vex is a TypeScript implementation of an **Optional-first, domain-agnostic, functional chain DSL**. The idea: given user objects that contain *domain values* (a `Vector`, `Color`, `Angle`, `NDVector`, …), you build small data-flow programs over collections of those objects with a fluent API. Programs are recorded as immutable-ish IR steps and evaluated *totally* — every failure (missing property, wrong type, unknown method, thrown exception) is supposed to collapse to `Optional.none` rather than throw.

The repository has three tiers:

1. **`README.md`** — a formal *language specification* (v0.9, RFC-2119 style) for the DSL.
2. **`dsl/`** — the implementation: IR, evaluator, chains, scopes, adapters, locals, optics.
3. **`math/` + `monads/`** — the demo domains the DSL is exercised against (Vector, NDVector/NDV, Angle, Color, Factory, TBBox).

**Important framing for readers:** the spec and the implementation have drifted apart significantly. The spec's headline surface (`._` proxy invocation, `.peers()`, `fork()`) is either untested or unimplemented, while the implementation's real center of gravity — the *named-locals* system (`localSet*` + `applyUsing`) and the *optics* system — is barely mentioned in the spec. See §8 (conformance matrix).

---

## 2. Repository Layout

```
Vex/
├── README.md                  # Formal DSL language spec (v0.9)
├── package.json               # private; scripts.test = "vitest" (watch mode)
├── tsconfig.json              # strict, esnext, bundler resolution, include:["./"]
├── brand.ts                   # generic runtime/type branding (+ leftover NodeId/EdgeId/LayoutId)
├── optional.utils.ts          # Optional combinators (mapOpt/chainOpt/…): UNUSED by the codebase
├── algebra/empty.ts           # Empty<T> instances (NaN-as-empty etc.): used only by monads/wrap.ts
├── math/
│   ├── math.ts                # scalar helpers (add/subtract/multiply/divide, ceilSqrt)
│   ├── algebra/monoid.ts      # Semigroup/Monoid + instances (first/all/any/sum/product)
│   ├── vector/vector.ts       # 2D Vector (all methods are per-instance arrow fields)
│   ├── vector/vector.types.ts # VectorBrand, Dimension, fold/reduce fn types
│   ├── vector/ndvector.ts     # named-component immutable vector (Record<string, number>)
│   ├── vector/ndv.ts          # NDV<K>: typed façade over NDVector (key-level typing)
│   ├── angle/angle.ts         # Angle (radians; add/scale/normalize/toVector)
│   ├── color/color.ts         # Color (r,g,b,a; add/multiply/clamp/toVector)
│   └── factory/factory.ts     # Factory: wraps a function; .invoke(...args)
├── monads/
│   ├── tbbox.ts               # TBBox<T>: Top/Bottom box (class; used by TBAdapter)
│   ├── topbottom.ts           # TB<T>: tagged-union Top/Bottom — DUPLICATE concept, unused
│   └── wrap.ts                # Wrap<T> applicative with Empty semantics — unused
├── dsl/
│   ├── eval.ts                # THE evaluator: all step semantics live here (~370 lines)
│   ├── expr/
│   │   ├── expr.enum.ts       # ExpressionType (arg-ref tags)
│   │   ├── expr.ir.ts         # ArgRef union: ConstD|ConstS|PropRef|OfRef|NestedExpr|Current
│   │   └── expr.step.ts       # Step union: Select|Switch|Invoke (the *declared* IR — see §5)
│   ├── domain/
│   │   ├── domain.adapter.ts  # DomainAdapter<D> interface (+ ParamSpec)
│   │   └── domain.expr.ts     # DomainExpr (step container) + domainExpr() proxy + normalizeArgs
│   ├── chain/
│   │   ├── base.chain.ts      # BaseChain + mapChain/arrayChain/matrixChain (+Typed variants)
│   │   ├── local.mixin.ts     # withLocal mixin: localSet*/applyUsing/applyPartial + _local map
│   │   └── multi.chain.ts     # MultiChain (fork/branch axis) — DEAD CODE: nothing constructs it
│   ├── scope/
│   │   ├── scope.ts           # Scope<D> interface (focus + property access, domain & raw)
│   │   ├── map.scope.ts       # MapScope over Record<string, Obj>
│   │   ├── array.scope.ts     # ArrayScope = MapScope over stringified indices
│   │   └── matrix.scope.ts    # MatrixScope over Obj[][] with "i,j" keys
│   ├── params/
│   │   ├── local.map.ts       # LocalMap<D>: immutable name → tagged entry map
│   │   ├── local.typed.ts     # LocalMapFor<D,S>: compile-time-shaped façade
│   │   └── param.shape.ts     # ParamShape = Record<string, ValueKind>
│   ├── optics.ts              # OLens<A,B> (Optional-lens) + prop/index/recordKey/oCompose
│   ├── optics.eval.ts         # focusRoot/peerRoot proxies + getFromFocus/getFromPeer
│   ├── optics.dsl.ts          # P(k) + chain() ergonomic lens builder
│   ├── optics.biblo.ts        # P(...path) + hardcoded "Biblo" app optics (schema leak)
│   ├── lenses.ts              # KeysOfType + MapLike/ArrayLike/MatrixLike type aliases
│   ├── op.meta.ts             # OpMeta + DSL_OP_META(_TABLE) symbols + annotateOp()
│   ├── value.enum.ts          # ValueKind: Domain|Scalar|Boolean|Unknown
│   ├── dsl.factory.ts         # createDSL(adapter) — UNUSED + returns chains WITHOUT locals
│   ├── traversal.ts           # Traversal<A>: reducers over Optional<A>[]
│   └── adapters/              # DomainAdapter instances + facades
│       ├── vector.domain.ts       # VectorAdapter (+ vectorExpr/vectorMapChain/… facades)
│       ├── ndvector.domain.ts     # NDVectorAdapter (fromScalar → EMPTY vector!)
│       ├── ndvector.adapter.lifted.ts # LiftedNDVectorAdapter (fromScalar → {scalar:n})
│       ├── angle.domain.ts        # AngleAdapter (has `partial`)
│       ├── color.domain.ts        # ColorAdapter (has `partial`)
│       ├── tbbox.domain.ts        # TBAdapter
│       └── factory.domain.ts      # FactoryAdapter
├── tests/                     # 11 vitest specs, 20 tests (see §9: coverage analysis)
└── external/                  # git submodules
    ├── Funk/                  # functional stdlib; Vex uses ONLY optional/{optional,either}.ts
    └── concat-src/            # source concatenation tool (not imported by code)
```

Stray/stale files at root: `out.txt` and `test.out.txt` (committed snapshots of old failing `tsc`/`vitest` runs from a previous machine path `S:/Code/Vex`), `commands ie. update-submodules.txt` (a filename with spaces), `dsl/Vex.code-workspace` (VS Code workspace file inside a source directory).

---

## 3. The Layer Stack

The spec (§2) mandates independent layers. Here is what each layer actually is, where it lives, and its real dependencies.

### 3.1 Optional layer — `external/Funk/optional/`

`Optional<T> = Either<TNotFound, T>` where `Either` is a `{tag:'Left',left}|{tag:'Right',right}` union. Constructors `some`/`none`, guard `isFound`, plus `fold/map/chain/getOrElse/…` on Either.

- Every `none()` allocates a fresh object (could be a shared singleton).
- `optional.utils.ts` at the repo root provides the spec-mandated combinators (`mapOpt`, `chainOpt`, `apOpt`, `sequenceArrayOpt`, `reduceWithMonoidOpt`) — **but nothing imports it**. The evaluator instead hand-rolls extraction with `foldEither(o, () => null, r => r)` ≈30 times, and both library code (`dsl/optics.ts:18`) and every test reach into `.tag`/`.right` directly — the exact thing the spec's own compliance checklist (§21, item 1) forbids.

### 3.2 Algebra layer — `math/algebra/monoid.ts`

`Semigroup`/`Monoid` interfaces plus instances (`first`, `all`, `any`, `sum`, `product`). Small and correct. Consumed only by `Traversal.fold/foldStrict`.

### 3.3 IR layer — `dsl/expr/*`

Declared abstract syntax:

- **`ArgRef<D>`** — argument references inside an `Invoke`:
  `ConstD(v)` (domain constant) · `ConstS(n)` (scalar) · `PropRef(name)` (property of *current focus*) · `OfRef(key, prop)` (property of a *specific peer*) · `NestedExpr(expr)` (sub-program applied to the current value) · `Current` (the pipeline value itself).
- **`Step<D>`** — `Select(prop)` (load `prop` from focus) · `Switch(to: Self|Other|Key|Index, key?)` (move focus) · `Invoke(op, args)` (call domain method).

**Reality check:** the *actual* IR contains ten more step kinds that are not in this union — the `local:*` steps pushed by `local.mixin.ts` (`local:set`, `local:setConst`, `local:setLens`, `local:setOptic`, `local:setPeerOptic`, `local:setNDVFromOptics`, `local:setNDVFromPeerOptics`, `local:setNDVFromPeers`, `local:apply`, `local:partial`). They are pushed via `as any` and the evaluator iterates `steps as any[]`. The declared IR type is a fiction; see BUGS.md V-020.

Surface→IR argument normalization (`normalizeArgs`, `dsl/domain/domain.expr.ts:39`): number → `ConstS`; DomainExpr proxy → `NestedExpr`; `[string, string]` pair → `OfRef`; string → `PropRef`; **anything else → `ConstD` without validation** (booleans, `null`, objects — see BUGS.md V-007).

### 3.4 Adapter layer — `dsl/domain/domain.adapter.ts` + `dsl/adapters/*` + `dsl/op.meta.ts`

`DomainAdapter<D>` binds a domain class to the DSL:

| Member | Role | Notes |
|---|---|---|
| `isInstance(v)` | runtime type guard | all use `instanceof` |
| `getMethod(self, name)` | resolve an op to a callable | **every adapter returns `(self as any)[name]`** — inherited members and non-functions leak through (BUGS.md V-008) |
| `fromScalar?(n)` | scalar → domain lift | plain `NDVectorAdapter` returns an **empty** vector, silently discarding `n` (V-002) |
| `methodReturns?(name)` | ValueKind of result | implemented by all 6 adapters, **consumed by zero code** — dead API |
| `methodParams?(name)` | names/kinds of parameters | drives `applyUsing` auto-ordering + shape validation |
| `partial?(self, op, names, vals)` | partial application | only Angle & Color; zero test coverage |

**Op metadata** (`op.meta.ts`): `OpMeta = { commutative?, associative?, liftScalar?, pure? }`, attached by `annotateOp(proto, name, meta)` either directly onto the prototype method function (`DSL_OP_META` symbol) or, when the method is an instance arrow-field (Vector), into a prototype-level table (`DSL_OP_META_TABLE`). `resolveMeta` (`eval.ts:70`) checks the function first, then walks the prototype chain for the table.

**This is the architecture's biggest structural liability:** metadata is *global mutable state on shared prototypes*, written by module-level side effects at import time. Two adapters annotating the same class (`NDVectorAdapter` and `LiftedNDVectorAdapter` both annotate `NDVector.prototype`) merge their metadata — behavior then depends on *which modules happen to be imported anywhere in the process*, and TS/esbuild import elision can silently drop the registration if the imported binding is unused. Empirically confirmed both ways; see BUGS.md V-002/V-003.

### 3.5 Scope layer — `dsl/scope/*`

`Scope<D>` = the object space + a *mutable current focus*:

- `getPropOpt(prop)` / `getPropOfOpt(key, prop)` — domain-guarded reads (Optional).
- `getRawPropOpt` / `getRawOfOpt` — raw reads for the optics system (no domain guard; `undefined → none`, but `null → some(null)`).
- `setFocusByKey/ByIndex/ToOther`, `currentKey`, `keys`.

Implementations: **MapScope** (`Record<string,Obj>`; keys snapshotted at creation), **ArrayScope** (MapScope over `"0"…"n-1"`), **MatrixScope** (`Obj[][]`, keys `"i,j"`, rectangularity assumed from row 0).

Focus mutation semantics diverge from the spec: an unknown key or an ambiguous `other()` **silently keeps/doesn't move focus and evaluation proceeds with the wrong object**, where the spec requires collapse to `none` (§4.2, §8). Both confirmed producing *wrong values, not errors* (BUGS.md V-004/V-005). MatrixScope additionally accepts garbage keys, poisoning focus to `NaN` coordinates (`currentKey()` → `"NaN,undefined"`).

Because focus is *shared mutable state* on the scope object captured by the chain, every chain evaluation, `traverse()`, and Switch step mutates it; results depend on evaluation order, `traverse()` leaves the focus on the last key, and nothing is safe to interleave. This single design decision is upstream of a surprising share of the defects.

### 3.6 Evaluator — `dsl/eval.ts`

`evalProgram(adapter, steps, initial, scope?, opts?: {strict?})` — a single ~270-line `for` loop over `steps as any[]`, dispatching on `sAny.t` with a chain of `if` blocks:

1. Ten `local:*` handlers (write to an *evaluation-local* `LocalMap`, call methods with named args, partials, NDVector construction from optics — note the generic evaluator **imports the concrete `NDVector` class**, a layering violation).
2. `Switch` — mutates scope focus (never fails, even when it should).
3. `Select` — `cur := scope.getPropOpt(prop)`; strict mode returns `none` on miss.
4. `Invoke` — guard `cur` is a domain instance → `getMethod` → evaluate `ArgRef`s → (strict) all-or-none sequencing → scalar-lift per `OpMeta.liftScalar` + `adapter.fromScalar` → `method.apply` in try/catch (throw → `none`).

Two argument-passing worlds coexist:

- **World A — positional IR args** (`Invoke.args: ArgRef[]`): what the spec documents; populated by the `._` proxy and `domainExpr()`.
- **World B — named locals** (`local:set*` → `local:apply {op, order?, shape?}`): a per-*evaluation* `LocalMap` maps names to tagged entries (`domain|scalar|boolean|any`); `applyUsing(op, order?)` resolves an argument order (explicit or from `adapter.methodParams`), validates kinds against a shape, and calls the method. This is what all the tests actually use.

The two worlds don't interact (locals can't appear as `ArgRef`s and vice versa), and World B's chain-side API is partially fake: the chain's `_local` field and its eight management methods (`getLocal`, `adoptLocal`, `localRename`, `localRemove`, `localProject`, `localMerge`, `localClear`, `localRequire`) operate on a *build-time* map that **the evaluator never reads** — `evalProgram` starts from `new LocalMap()` unconditionally (confirmed empirically; BUGS.md V-006).

Strict mode (`opts.strict`) is honored inconsistently per step kind (some hard-return, some poison-and-continue, `Select` can resurrect a poisoned pipeline even in strict mode). A behavior matrix is in BUGS.md V-013.

### 3.7 Chain layer — `dsl/chain/*`

`BaseChain<Obj, D>` holds `steps: Step<D>[]` (mutable, append-only) + the adapter + the scope.

- `.prop(name)` → `Select`; `.self(k?)`/`.other(k?)` → `Switch`; `._` → a Proxy whose every property access returns an arg-recording function pushing `Invoke` (any method name works — "ergonomics without magic").
- `.build()` snapshots `[...this.steps]` and returns `(start) => Optional` — but the *scope* (and its focus) stays shared, and the chain object remains mutable: continuing to call `._` on a chain you already evaluated appends more steps, so "the same call" returns different results over time (confirmed; V-010).
- `.traverse(expr?)` / `.traverseStrict(expr?)` — replays the program for every scope key (mutating focus), optionally post-applying a `DomainExpr` to each found base value, and wraps results in a `Traversal`. The `invoke` it hands the traversal for `reduceBy` calls methods **directly on values, bypassing the adapter, metadata, and try/catch** (V-009).
- **`.peers()` does not exist** despite being a headline spec feature (§9.2, examples §18.2/18.3) — calling it is a `TypeError` (V-001). `fork()`/`MultiChain` likewise: `multi.chain.ts` is complete-looking dead code that nothing can construct (and would crash on select-less programs, V-011).

Factories: `mapChain`/`arrayChain`/`matrixChain` wrap `BaseChain` with the `withLocal` mixin; `*ChainTyped` variants add a phantom shape parameter. **All of them return `any`** (the `new (Chain as any)(…)` expression erases every type), so the entire fluent surface is unchecked — `vectorMapChain({A}).thisMethodDoesNotExist(42)` compiles (confirmed via tsc probe; V-012). Separately, `createDSL()` (`dsl.factory.ts`) constructs raw `BaseChain`s *without* the mixin, so the two construction paths expose different APIs (V-014).

### 3.8 Traversal layer — `dsl/traversal.ts`

`Traversal<A>` wraps `Optional<A>[]` with lenient reducers (`any/all/none/sum/min/max/fold/reduceBy` ignore `none`s) and strict variants (`anyOpt/…/foldStrict` return `none` if any element is `none`). Design is per spec §10 and mostly sound; issues are totality (projection functions and `reduceBy` may throw through the API, V-009) and efficiency (`extract` re-runs per call; `anyOpt` calls `toArray()` twice; `Math.min(...arr)` spreads).

### 3.9 Optics layer — `dsl/optics*.ts`

A small Optional-lens system, and the *bridge between raw object data and the DSL*:

- `OLens<A,B> = { get: A → Optional<B>, set: (A,B) → Optional<A> }`, with `prop`, `index`, `recordKey`, `oCompose` (note: `oCompose` re-evaluates `ab.get(a)` up to three times and reaches into `.right` directly).
- `optics.eval.ts` builds Proxy "roots" over the scope's raw getters so a lens can read `focus.pos.x` or `peer.pos.x` without knowing about scopes.
- Two competing path-builder facades both named `P` (`optics.dsl.ts` single-key vs `optics.biblo.ts` variadic path) — an import footgun.
- `optics.biblo.ts` hardcodes an application schema ("Biblo": `vector.defaults.factor`, `color.palette.*`, `pos.x/y/z`) into the library.

The `local:setOptic`/`local:setLens`/`local:setNDVFrom*` steps connect lenses to locals: read numbers from focus/peers, optionally assemble them into an `NDVector`, store under a name, then `applyUsing`. This is the most novel and most load-bearing part of the implementation — and the least specified (the README never mentions optics or locals).

### 3.10 Math domains — `math/*`

| Class | Style | DSL quirks |
|---|---|---|
| `Vector` (2D) | **~50 per-instance arrow-function fields** | why `DSL_OP_META_TABLE` exists (no prototype methods to annotate); heavy allocation per instance; `divide` maps ÷0 to 0 silently; rich comparator family (`allPositive`, `anyNonPositive`, …) |
| `NDVector` | prototype methods, immutable, frozen components | constructor **silently drops non-finite components**; missing keys read as 0; `pick` drops zeros by default but `withKeys` keeps them |
| `NDV<K>` | typed façade extending NDVector | key-set arithmetic in types (`addT: NDV<K∪K2>`); heavy `as` casting internally; sound at runtime |
| `Angle` | prototype methods | `normalize` to [−π, π); `toVector` returns a plain `{x,y}` (not a `Vector`) |
| `Color` | prototype methods | `add` keeps `this.a` (breaks its own `commutative` annotation, V-016); `multiply` is scalar-only |
| `Factory` | prototype method | wraps any function; `invoke(...args)` |

`monads/`: `TBBox<T>` (class Top/Bottom, used by `TBAdapter`), plus **two unused parallel implementations** of adjacent ideas: `topbottom.ts` (`TB<T>` tagged union duplicating TBBox) and `wrap.ts` + `algebra/empty.ts` (Wrap applicative with NaN-as-empty semantics). `brand.ts` carries generic branding plus `NodeId/EdgeId/LayoutId` aliases that look like leftovers from a different (graph-layout) project.

---

## 4. Life of a Program (worked example)

```ts
const out = vectorMapChain({ A, B })     // MapScope over {A,B}, focus idx 0; chain steps=[]
  .prop("position")                      // push Select("position")
  ._.add("size")                         // push Invoke("add", [PropRef("size")])
  .other()                               // push Switch(Other)
  ._.subtract("position")                // push Invoke("subtract", [PropRef("position")])
  .value("A");                           // build + run
```

`value("A")` → `build()` copies steps, wraps them in `DomainExpr.build(adapter)` → sets focus to `"A"` → requires ≥1 `Select` somewhere (spec wants it *before the first Invoke*; not enforced) → `evalProgram`:

1. `Select("position")` → `cur = some(A.position)` (guarded by `isInstance`).
2. `Invoke("add", [PropRef("size")])` → arg = `scope.getPropOpt("size")` = `some(A.size)` → meta for `add` has `liftScalar` (irrelevant here) → `cur = some(A.position.add(A.size))`.
3. `Switch(Other)` → exactly 2 keys, focus flips to `"B"`.
4. `Invoke("subtract", [PropRef("position")])` → `PropRef` now reads **B**.position (focus moved) → `cur = some(prev.subtract(B.position))`.

Result: `some((A.position + A.size) − B.position)` — the spec's §18.1 separation test. Note the load-bearing subtlety: `PropRef` resolution is *focus-relative at invoke time*, which is exactly why silent focus-move failures (V-004/V-005) produce plausible-looking wrong numbers instead of errors.

The equivalent World-B program (what the tests actually exercise):

```ts
mapChain(VectorAdapter, { A, B })
  .prop("position")
  .localSetOf("rhs", "B", "position")   // local:set {name:"rhs", src:{kind:"of"...}}
  .applyUsing("subtract")               // local:apply; order inferred from methodParams
  .value("A");
```

---

## 5. Design Assessment

### What's genuinely good

- **Optional-first totality as a design goal** — the evaluator's Invoke path (guard → resolve → sequence args → try/catch) is the right shape, and the `Optional`/`Either` foundation is clean and minimal.
- **The IR + replay model** — recording steps and replaying them per start key is simple, debuggable in principle, and makes `traverse` almost free.
- **The adapter concept** — one small interface per domain, no per-method wiring, with `annotateOp` metadata for lifting/algebraic hints. The *idea* is sound; only the *global-prototype storage* is broken.
- **Named locals + optics** — `localSetNDVFromPeers` (assemble an ad-hoc vector from lens reads across multiple peers, then `applyUsing`) is a genuinely expressive primitive that the spec never even imagined.
- **`NDV<K>`** — the typed key-set algebra over NDVector is a nice piece of type-level design.
- **The spec itself** — having a normative document with MUST/SHOULD conformance items and a compliance checklist puts this far ahead of most hobby DSLs. The problem is only that reality diverged.

### The five structural flaws

1. **Global mutable op-metadata on shared prototypes, registered by import side effects.** Cross-adapter contamination, import-order dependence, import-elision fragility. (V-002/V-003; fix: adapter-owned op registry — ROADMAP P2.1.)
2. **Shared mutable focus on the scope.** Silent wrong-focus evaluation, order-dependent results, traverse pollution, no concurrency. (V-004/V-005; fix: focus-as-value — P2.2.)
3. **Two disconnected "locals" worlds.** Build-time `_local` + management API that evaluation ignores. (V-006; fix: single evaluation-time model — P2.3.)
4. **The IR type union is a lie** and the evaluator is a 370-line untyped monolith that imports a concrete math class. (V-020/V-021; fix: full step union + handler registry — P2.4.)
5. **The public surface is `any`-typed** (factories) and the two construction paths diverge (`createDSL` vs `mapChain`). (V-012/V-014; fix: typed factories — P3.2.)

### Spec-implementation drift (headline items)

Full matrix in §8. `.peers()` and `fork()` unimplemented; `ConstD` validation, `getMethod` unknown-name behavior, `other()`/`Switch` failure semantics, and surface totality all violate MUSTs; conversely locals, optics, `applyPartial`, strict mode, raw scope getters, and `traverseStrict` are implemented but unspecified.

---

## 6. The Adapters in Detail

| Adapter | Domain | `fromScalar` | `partial` | annotated ops (`liftScalar`) | notes |
|---|---|---|---|---|---|
| `VectorAdapter` | `Vector` | `Vector.scalar(n)` | — | add✓, multiply✓, subtract✓, divide✓ (all lift), scale✗ | metadata lands in the prototype *table* (arrow-field methods) |
| `NDVectorAdapter` | `NDVector` | **`new NDVector({})` — discards n** | — | add, subtract, multiply, dot (no lift *as written*, but see V-002) | `methodParams` for add/subtract/multiply/scale/clamp/dot |
| `LiftedNDVectorAdapter` | `NDVector` | `new NDVector({scalar: n})` | — | add✓, subtract✓, multiply✓, dot✓ (lift) | annotates the **same prototype** as the plain adapter |
| `AngleAdapter` | `Angle` | — | ✓ (`finish` closure) | add, scale | `toVector` declared Unknown |
| `ColorAdapter` | `Color` | `new Color(n,n,n,1)` | ✓ | add/multiply/clamp all `liftScalar:false` | `add` wrongly annotated commutative (V-016) |
| `TBAdapter` | `TBBox<any>` | — | — | map/chain/getOptional/valueOr (no meta) | params are names-only (`["f"]`) → kinds unvalidated (functions stored as `any` entries) |
| `FactoryAdapter` | `Factory` | — | — | — | `invoke` params unknown → caller must pass explicit order |

---

## 7. External Dependencies

- **`external/Funk`** (git submodule, SSH URL): only `optional/optional.ts` + `optional/either.ts` are imported (~90 lines total). The rest of Funk (cache, memo, collections, functional, guards, monads, references) is dead weight for this repo. The spec references `UnitalOptionalMap` (§17 memoization) from here — never used.
- **`external/concat-src`** (git submodule): source-concatenation tooling; not imported by any code (a copy also sits at `external/Funk/concat-src.js`). `.gitignore`'s `src-catalog.md` entry is its output.
- **npm**: dev-only — `vitest` + `@types/node`. **`typescript` is not a devDependency** even though the committed workflow file documents running `tsc --noEmit`; a fresh clone cannot typecheck (V-030).

Submodules pin exact SHAs and use SSH remotes (`git@github.com:`), which breaks anonymous/HTTPS contributors and CI without key setup; the currently-uncommitted `.gitmodules` change (personal-remote → standard remote) is symptomatic. Given only ~90 lines are used, vendoring or packaging Funk is worth considering (ROADMAP P4.3).

---

## 8. Spec Conformance Matrix (README v0.9 → implementation)

| Spec § | Requirement | Status |
|---|---|---|
| §2.1 | Optional layer used for all access; no `.left/.right` outside it | ❌ `optional.utils.ts` unused; `.tag`/`.right` poked in `dsl/optics.ts`, `local.typed.ts`, `local.mixin.ts`, all tests |
| §3.2 | `ConstD` validated by `isInstance` at invoke | ❌ never validated → silent NaN (V-007) |
| §4.1 | `Select` required before first `Invoke`, else `none` | ⚠️ only "a Select exists somewhere" is checked |
| §4.2/§8 | invalid `Switch`/`other()` ⇒ `none` | ❌ silent no-op ⇒ wrong values (V-004/V-005) |
| §5 | Invoke: unknown method ⇒ `none` | ⚠️ inherited/non-function members leak (V-008) |
| §5 | args sequenced strictly; any `none` ⇒ `none` | ✅ |
| §6 | surfaces (`value/traverse/peers/reduceBy`) never throw | ❌ `reduceBy`/`map` throw through (V-009); `peers` is a TypeError (V-001) |
| §7.1 | `getMethod` returns `undefined` for unknown names | ❌ (V-008) |
| §7.2/§13 | scalar lift per metadata + `fromScalar` | ✅ mechanism works (confirmed) — but metadata storage is global (V-002) |
| §8 | MapScope/ArrayScope/MatrixScope with Optional accessors | ✅ (plus unspec'd raw accessors) |
| §9.1 | chain surface: prop/self/other/`._`/build/value | ✅ exists; `._` path has zero test coverage |
| §9.2 | `.traverse(expr?)` | ✅ · `.peers(expr?)` ❌ **missing entirely** |
| §10 | Traversal lenient reducers + strict variants | ✅ (foldStrict + `*Opt` family) |
| §11 | `methodReturns` typing extension | ⚠️ implemented by adapters, consumed by nothing |
| §12.4/§20 | `fork()` branch axis (extension) | ❌ MultiChain exists but is unreachable dead code |
| §17 | expression memoization via UnitalOptionalMap | ❌ not implemented (optional) |
| §21 | compliance checklist | fails items 1 (left/right), 3 (§5 exactness), 5 (`other()` ⇒ none) |
| — | locals system, optics system, `applyPartial`, strict mode, `traverseStrict`, raw getters | **implemented but entirely unspecified** |

---

## 9. Test Suite Analysis

20 tests / 11 files, all green. But coverage is narrow: effectively *World B happy paths* (locals + `applyUsing`) plus NDV unit math.

**Not covered at all:** the `._` proxy invoke path (the spec's primary surface — §18 examples), `.other()`, `.self(key)` switching, `traverse(expr)` with a mapper, every Traversal reducer except one `anyOpt`, `reduceBy`, scalar lifting, `NestedExpr`/`OfRef`/`ConstD` argument kinds, `arrayChain`, `matrixChain`, `applyPartial`, `localSetLens`, `localSetExpr`, `localSetOf`, `localRename/-Remove/-Project/-Merge/-Clear/-Require` (unsurprising — they do nothing observable, V-006), `createDSL`, `MultiChain`, strict-vs-lenient behavior differences, and any error/`none` path beyond one strict-traversal check.

**Quality issues:** `dsl.angle.spec.ts:24` asserts `res.tag === "Left" || res.tag === "Right"` — a tautology; `dsl.composite.spec.ts` never touches the DSL (plain TS arithmetic); every file reads `.tag`/`.right` raw instead of a helper (`expectSome(x): T`).

The stale committed artifacts `out.txt`/`test.out.txt` record a period when 3 of these tests failed and the NDV typing didn't compile — worth deleting now that they pass (the fixes landed; the artifacts didn't get cleaned up).

---

## 10. Reading Order for New Contributors

1. `README.md` §§0–10 (the intended semantics) — then this file's §8 for where reality differs.
2. `external/Funk/optional/{either,optional}.ts` (30 lines that everything uses).
3. `dsl/expr/*` → `dsl/domain/domain.expr.ts` (IR + recording).
4. `dsl/scope/map.scope.ts` (focus model) → `dsl/eval.ts` (all semantics).
5. `dsl/chain/base.chain.ts` + `dsl/chain/local.mixin.ts` (surface).
6. `dsl/traversal.ts`, `dsl/optics*.ts`, then adapters as needed.
