# Regressions

Each defect of the audits ([`docs/archive/2026-07/BUGS.md`](../docs/archive/2026-07/BUGS.md)) has a row. A defect that the work finds later gets the next ID. A row with the status `test` has a test that names the ID. A row with the status `resolved` names the change that removed the defect. The test `spec-coverage.test.ts` checks each `test` row.

| ID | Status | Evidence |
|---|---|---|
| V-001 | test | The others axis exists (`@mark1russell7/vex` builder tests) |
| V-002 | test | The plain and lifted NDVector domains are independent (`@mark1russell7/vex-domains`) |
| V-003 | test | A domain does not change its class (`@mark1russell7/vex` domain tests) |
| V-004 | test | An unknown key gives `#REF!` |
| V-005 | test | `other` outside a pair gives `#REF!` |
| V-006 | test | Bindings exist only in the expression, through `let` and `with()` |
| V-007 | test | A literal of the wrong kind gives `#VALUE!` |
| V-008 | test | Inherited members are not ops |
| V-009 | test | An op that throws in a reduction gives an error, not an exception |
| V-010 | test | Chains are immutable |
| V-011 | resolved | `MultiChain` is gone. `fork()` makes a record of branches. |
| V-012 | test | No value type is `any` |
| V-013 | test | Strictness exists only for list ops, with one rule |
| V-014 | resolved | `createDSL` is gone. `vex()` is the only entry point. |
| V-015 | resolved | The old strict-mode code is gone with `@vex/legacy`. |
| V-016 | test | The law checker finds the false claim of the old `Color.add`, and the new `Color.add` is commutative |
| V-017 | test | NDVector keeps non-finite components, and the domain check reports them |
| V-018 | test | Division by zero gives `#NUM!` |
| V-019 | test | A position outside a grid gives `#REF!` |
| V-020 | resolved | The `Expr` type lists each kind, and the interpreter switch is exhaustive (Oxlint `switch-exhaustiveness-check`). |
| V-021 | test | `@mark1russell7/vex` imports no domain package |
| V-022 | test | A value is not `undefined` |
| V-023 | resolved | `applyUsing` is gone. Arguments are expressions. |
| V-024 | resolved | `methodReturns` is gone. The builder reads return types from the method signatures. |
| V-025 | resolved | `Optional` and `Result` are the public types of the core, with documented fields. |
| V-026 | resolved | The two `P` exports and the Biblo schema are gone. Paths are references. |
| V-027 | test | The methods of `Vec2` are on the prototype |
| V-028 | resolved | The dead code is gone with `@vex/legacy`. |
| V-029 | resolved | The traversal reductions use the list ops of the interpreter, with one pass. |
| V-030 | resolved | TypeScript is a dependency of each package (P0). |
| V-031 | resolved | `pnpm test` runs `vitest run` (P0). |
| V-032 | resolved | The packages have `main` and the workspace build. The npm build is part of phase P5. |
| V-033 | resolved | Each package has its own `tsconfig.json` with `src` as the root (P0). |
| V-034 | resolved | The stale files are gone (P0). |
| V-035 | resolved | The submodules are gone. Funk is vendored (P0). |
| V-036 | resolved | CI runs typecheck, Oxlint, tests and ste-lint (P0). |
| V-037 | resolved | The new suites replace the old tests. |
| V-038 | test | String and array values pass as literals |
| V-039 | test | The ops section does not record `build` |
| V-040 | test | `origin()` goes back to the start |
| V-041 | test | A chain is not a thenable |
| V-042 | test | The others axis evaluates the base at the origin and the body at each target |
| V-043 | test | The moves before an axis are its address. Before the fix, `parent().children()` gave the children of the origin. |
| V-044 | test | A domain value with `toJSON` round-trips through `serialize` and `parse`. Before the fix, `serialize` wrote the `toJSON` form, and `parse` gave a plain object. |
