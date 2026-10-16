# The plan to zero defects

*Started: 2026-10-11.* This plan adds to [`REVIEW.md`](./REVIEW.md), the plan of record. It tells how the work finds the remaining defects of Vex, and how the work shows that few remain.

## 1. The goal

Zero known defects is the first goal. Each defect that the work finds gets a regression row in [`spec/regressions.md`](../spec/regressions.md) and a test that names it. It also gets a fix, and a search for defects of the same class.

Zero unknown defects is not a thing that a test can prove. Thus the plan measures the rate of discovery. The work stops a phase when the tests of that phase find no new defect for a long run.

The exit criteria of the plan:

| Criterion | Target |
|---|---|
| Each requirement ID of the spec | An example test and a property test |
| Each member of the builder | Generated chains that combine it with each other member |
| Each use case of §5 | A pilot with a reference, and a page or a doc example |
| Mutation score of each published package | 98 % or more |
| Property runs | One million runs of each property with no failure |
| Browsers | Chromium, Firefox and WebKit, in the light and the dark theme |
| Discovery rate | No new defect in four weeks of nightly runs and use-case work |

## 2. The evidence: what found the defects

| Source | Defects | Example |
|---|---|---|
| Code reading (the audit of July) | V-001 to V-042 | V-042: the peers axis gave wrong results |
| The error catalog (golden file) | 3 | An extension error had no location |
| The doc tests | 1 | The README sample gave a class where a domain is necessary |
| A real use case (the Jqy audit) | V-043 | `parent().children()` gave the children of the origin |
| The tests of each spec rule, after the rebuild | 0 | |

The tests of each rule find no new defects, because each test checks one rule alone. The defects are in the combinations that no rule names, and in the needs of real programs. Thus this plan puts two things first: generated combinations and real use cases.

## 3. The classes of defects, and the test for each class

| Class | Example | The test that finds the class |
|---|---|---|
| A. Combination | V-043: a move before an axis | The builder model test (§4.1) |
| B. Divergence between implementations | `compile` and `evaluate` give different results | Differential tests: `evaluate`, `compile`, the reference, the JSON round trip and the Lab reader give one result |
| C. Types against run time | The type says `number`, and the value is a `Vec2` | Generated chains that compare the static type with the domain of the value |
| D. False laws | `Color.add` said that it is commutative | The law checker on each domain, and new domains that stress the domain API |
| E. Numbers at the edge | `NaN`, `-0`, `Infinity`, very large values | Each op with the edge values, and the `valid` hook of each domain |
| F. Error paths | An error without a location | Each error code at each position: argument, axis body, `where` test, binding, extension |
| G. Speed | An axis in an axis that is slower than necessary | A bench gate in CI with a limit for each program |
| H. The site | A widget that fails in Safari | Cross-browser tests, screenshot comparison and keyboard tests |
| I. Packages | A package that fails in one bundler | Install tests with Vite, esbuild, Node 22, 24 and 26, Bun and Deno |

## 4. New test tools

### 4.1 The builder model test (class A and C)

The property tests of `@mark1russell7/vex-testkit` generate random IR. Random IR does not test the builder. The builder model test generates random chains through the builder API:

1. A generator makes a sequence of builder calls: moves, axes, ops, reductions, `fork`, `with`, `call` and `ifError`.
2. A model gives the expected IR, or the expected result, for each sequence. The model is a small interpreter of the builder calls, written without the builder.
3. The test compares the builder with the model at each key of random spaces.
4. The test also checks the static type of each chain against the domain of its value.

This test finds defects like V-043. V-043 was in the code for months.

### 4.2 Differential tests (class B)

One program has five paths. They are `evaluate`, `compile(...).run`, the reference evaluator, `serialize` then `parse`, and the Lab reader. Each path gives the same result for random programs. The Lab reader also gives the same IR as the builder for the same chain text.

### 4.3 Edge values (class E and F)

A table gives the edge values of each domain. A test applies each op to each edge value. The result must be a value of the domain, or an error value with a location.

### 4.4 The site (class H)

- Playwright runs the browser tests in Chromium, Firefox and WebKit.
- A screenshot comparison checks the main widgets in the light and the dark theme, at the desktop width and the phone width.
- A keyboard test uses each widget without a pointer.

## 5. The use-case program

A use case is a real program from a real domain. Each use case gives three things:

1. A pilot in `@vex/pilots`: the Vex formulas, a reference in plain TypeScript, and property tests that compare the two on random inputs.
2. A gallery page or a doc example, so the use case also teaches.
3. A list of findings: defects, missing ops, missing members and unclear rules.

| Area | Use case | What it stresses |
|---|---|---|
| Layout | The Jqy audit (done), the Graph grid (done), alignment and spacing checks | Tree spaces, moves, `others` with `where` |
| Spreadsheets | A loan schedule, a budget with categories, a grade book, stock reorder points | Sheets, recurrences, tree sums, ranks |
| Simulation | Life (done), Langton's ant, heat diffusion, flocking | Grids, `neighbors`, distances in `others` |
| Validation | Cross-field form rules, invoice lines against the invoice total, CSV rows | Error values, `ifError`, records |
| Trees | File sizes, a bill of materials, an org chart (in the Lab) | `descendants`, `ancestors`, roll-ups |
| Geometry | Collisions, the nearest neighbor, polygon area with `offset` | `Vec2`, array spaces, reductions |
| Color | Contrast checks of a palette (WCAG) | The `Color` domain, pairs |
| Schedules | Task dependencies and calendar overlaps | Spaces that are not trees: a gap of the spec |

## 6. Gaps known at this time

| Gap | Found by | Plan |
|---|---|---|
| A list chain has no `keys()` and no `errors()`, but the IR has both list ops | The Jqy pilot | Add both to the builder |
| `Vec2` has no `reflect` and no `aspectRatio`. No domain has 3D vectors or transforms. | The Jqy demo | Add the ops, and a `Transform` domain with a use case |
| The mutation lane had the gate of 95 % only on `@mark1russell7/vex` | The review of the tests | Done. The nightly lane gave 77 % for the domains and 78 % for the test kit. New tests found the survivors, and each published package has the gate of 95 % (`tools/mutation/README.md`). The lane does not mutate the generators of test data (`arbitraries.ts` and `builder-model-arbitraries.ts`), because a mutant of a generator changes the distribution of the data, not a behavior. |
| The browser tests run only in Chromium | The review of the tests | Add Firefox and WebKit |
| A graph that is not a tree has no space | The schedule use case | A `graph` space with the axes `in` and `out`, after a spec decision |
| A JSON literal with the key `$vex` reads back as a domain value, so the round trip changes the literal | The five-paths test (P13) | An escape of the key `$vex` in the JSON format, after a decision. An `it.fails` test keeps the defect visible. |

## 7. The process for each defect

1. Add a row to `spec/regressions.md` with the next ID.
2. Write a test that names the ID and fails before the fix.
3. Fix the defect. Add or change a spec rule if the rule was unclear.
4. Name the class of the defect (§3), and search the code for other defects of that class.
5. Add a property or a generator that finds the class, not only the one defect.

## 8. The phases

| Phase | Work | Done when |
|---|---|---|
| A | The builder model test, the differential tests, `keys()` and `errors()`, mutation on all published packages | The tests run in CI, and each finding has a row |
| B | Eight use-case pilots of §5, each with a page or a doc example | Each pilot passes on one million runs |
| C | Cross-browser tests, screenshot comparison, keyboard tests, a bench gate | The tests run in CI |
| D | The long run: one million runs of each property each week, and use-case work | Four weeks without a new defect |

## 9. The status

*Updated: 2026-10-16.*

| Phase | Status | Evidence |
|---|---|---|
| A | Done | The builder model test, the property P13 (five paths), the Lab reader against the builder, `keys()` and `errors()`. Mutation scores: the core 99 % on the changed files, the domains 100 %, the test kit 99 %. The gate checks each package at 95 %. |
| B | Done | Eight use-case pilots in `@vex/pilots`: the loan, the bill of materials, the grade book, the invoice, heat diffusion, flocking, polygons and palette contrast. Each spreadsheet pilot runs three ways: the builder, the formula language and plain TypeScript. Two gallery pages show them with doc tests. |
| C | Done, except the screenshot comparison | The browser tests run in Chromium, Firefox and WebKit. The speed gate checks the ratio of Vex to hand-written loops. The screenshot comparison needs reference images from Linux, so it waits. |
| D | Started | The weekly workflow runs one million runs of each property. The phase ends after four weeks without a new defect. |

The defects that the plan found: V-043 (a move before an axis), V-044 (`toJSON` in `serialize`), V-045 (the key `$vex`), V-046 (`-0` in JSON), V-047 (the types of a lifted number) V-048 (a deep recurrence in `SheetRun` gave a wrong number), V-049 (an empty `reduce` of vectors gave the number 0), V-050 (`ifError` hid a full call stack) and V-051 (the memo of the compiler did not see the address of the axis `all`). The use cases also closed gaps. A list chain has `keys()`, `errors()`, `result`, `at` and `explain`, and a chain has `if()`. A tree has an offset. The domains have `TextDomain` and the WCAG ops of `ColorDomain`. The formula language has `&` for numbers and `VEC`.

The decisions that the owner made:

- An empty `reduce` gives an error unless one domain has an identity for the op. `reduce(op, { domain })` names the domain (V-049, version 0.4.0).
- Vex does not depend on the call stack. A sheet reads its cells from a work list, and an expression can nest 500 levels deep. A full call stack in host code gives `#DEPTH!`, and `ifError` does not hide it (V-050, version 0.5.0).

The decision that is open: a graph that is not a tree has no space.
