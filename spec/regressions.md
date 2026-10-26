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
| V-045 | test | A literal record with the key `$vex` came back from JSON as a domain value. The escape form keeps it data. |
| V-046 | test | A literal `-0` came back from JSON as `0`. The number form keeps it. |
| V-047 | test | The types of a lifted number parameter accepted only a number literal. After the fix, a number field, an argument or a chain of a number type-checks too. |
| V-048 | test | A first read of a cell at the end of a long recurrence went deep into the call stack. The overflow became an error value, and `IFERROR` gave its fallback: a wrong number without an error. `SheetRun.cell` evaluates the column in key order. |
| V-049 | test | An empty `reduce` took the identity of the first domain with the op, so an empty sum of vectors could be the number 0. When more domains have an identity, the result is `#N/A`, and the option `domain` names one. |
| V-050 | test | A full call stack became `#CALC!`, so `ifError` gave its fallback, and a sheet showed a wrong number. A full call stack gives `#DEPTH!`, and `ifError` does not hide it. |
| V-051 | test | The address of the axis `all` can fail, but the memo of the compiler took a list op over it as a value of the space. Tier 2 gave the value of the first key at each key, and a standalone module did not evaluate the address. |
| V-052 | test | A move from the focus can fail before a fixed key, an index or the origin. The memo of the compiler took such an address as a fixed key, so tier 2 gave the value of another key. A standalone module kept only the code of the last move. |
| V-053 | test | A node with a tag that the version does not know made `compile` throw a `TypeError`. A program with `fold` gave this error in 0.6.0. `compile`, `evaluate`, a sheet and the compiler check the shape first, and the error is `#VALUE!` with the reason. |
| V-054 | test | A standalone module counted a call of a function as one node of work, so a call with a costly body was not a column of the run. The module computed the body again at each read, and the radial layout of ireko was two times slower. The work of a call counts the body of its function. |
| V-055 | test | A constant of the run that read a lazy constant, or called a function with a loop, evaluated before the run. The radial module started its search of a radius at each run, also for a ring with a closed form. Such a constant is lazy too. |
| V-056 | test | A program that is not an object, for example the number `0` from JSON, made `evaluate`, `explain` and a sheet with a compiler throw a `TypeError`: the caches of compiled programs take only objects. The program gives `#VALUE!` (EVAL.SHAPE). The property P20 found it. |
| V-057 | test | The check of an inline form split each `!==` of a domain op in two ways. A text of many `!==` and then a quote took exponential time, so `emitModule` was busy for hours (CodeQL `js/redos`). A tokenizer takes one token at each step. |
| V-058 | test | The check of an inline form took `<<=` as `<` and `<=`. So the inline form of `(a) => (a <<= 1)` wrote the field of the record, and the module gave a value that the interpreter did not give. The tokenizer takes `<<`, `>>` and `>>>` first. |
| V-059 | test | A static site of tier 2 compared the JavaScript type of its result with the kind of a domain, for example for `xy` of `NumDomain`. The test was always false, so each run went to tier 1. Such a result gets the checks of the interpreter. |
| V-060 | test | The option `name` of `emitModule` took a reserved word, a name that the module declares or a global that a module reads, for example `class`, `F` or `Math`. The module did not parse, or its code read the run in place of the global. `emitModule` gives the reason. Another name, for example `Intl`, gives a module as before. |
| V-061 | test | The check of a result of a domain had the name of the domain in its own name. A domain name with a space, a dot or a parenthesis, for example `NDVector(lifted)`, gave a module that did not parse. Such a check has the index of its domain in its name. |
| V-062 | test | An assignment of the key `__proto__` changes the prototype of a record, so the record loses the field. Thus `parse`, `serialize`, `rec`, the builder, tier 2 and a module lost a field or a binding with that name. Each record gets its fields from `Object.fromEntries`, and a module writes the key as `["__proto__"]`. |
| V-063 | test | A standalone module of a sheet took a count of all the items, whose body cannot fail, as the count of the records. So it did not read the cells of the body, and the search of the run did not see them. A cell that read itself in such a body gave a value, not `#CYCLE!`. A count whose body reads a cell keeps its loop. The property P17 found it. |
| V-064 | test | The runtime of tier 2 gave `FALLBACK` for a list op on an array (LIST.ARRAY). In the body of a list op over an axis, `FALLBACK` is an error item, so the loop skipped each item. Thus `count(each(all, keys([])))` gave 0, not the count of the records. Such a list op goes to tier 1. The property P17 found it. |
