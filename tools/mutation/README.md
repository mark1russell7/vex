# The mutation lane

The lane runs Stryker on the four published packages: `@mark1russell7/vex` (`core`), `@mark1russell7/vex-domains` (`domains`), `@mark1russell7/vex-testkit` (`testkit`) and `@mark1russell7/vex-compiler` (`compiler`). It uses Vitest 4.1, because Stryker does not support Vitest 5 at this time.

## The gate

Each package must have a mutation score of 95 % or more. Stryker has one threshold for all files, so its own break is off. The script `scores.mjs` gives the score of each package, and it fails when a package is under 95 %.

The variable `VEX_MUTATE` names the packages of a run, for example `compiler` or `core,domains`. Without it, a run mutates the four packages. Then `scores.mjs` applies the gate to the packages of the run only.

The core has two parts: `core.kernel` and `core.base`. `core.kernel` is the modules of the kernel of coeval: `kernel.ts`, `plan.ts`, `same.ts`, `document.ts`, `deps.ts` and `write.ts`. `core.base` is the other modules. Each part gets the gate of 95 %, so the core gets it too. `core` names the two parts in one run.

## The nightly job

The nightly job has one runner for each package, and one runner for each part of the core. Each runner has a time limit of 150 minutes, and it keeps its report as the artifact `mutation-report-<package>`. On 2026-10-24, the kernel of coeval made the core run longer than 90 minutes on one runner, so the core got two parts.

## Type checks

Stryker adds `// @ts-nocheck` to each file of its sandbox by default. The lane turns this off (`disableTypeChecks: false`), because Vitest does no type check. Also, the golden source files of the compiler must stay as they are.

## The modules of the compiler

A standalone module copies the text of each op function of a domain. A mutated domain has the code of Stryker in that text, so the module refuses the op. Thus only `compiler/module.test.ts` gets `@mark1russell7/vex-domains` from the copy that Stryker does not mutate (`vitest.config.ts`). Put each test that emits a module with ops of the domains in that file. On 2026-10-19, a test in `tiers.test.ts` emitted a module, and the dry run of the domains failed.

## The files that the lane does not mutate

| File | Reason |
|---|---|
| `*.test.ts`, `core/test-support.ts`, `testkit/fc-setup.ts` | These files are tests and test setup. |
| `*/index.ts` | These files only export other files. |
| `testkit/arbitraries.ts` | This file generates test data. A mutant changes the distribution of the data, not a behavior that a test can check. |
| `testkit/builder-model-arbitraries.ts` | This file generates the calls of the builder model test, for the same reason. The model and the runner are in `builder-model.ts`, and the lane mutates them. |

## A module that does not load

A mutant at the top level of a module can make the module throw when it loads. Then each test file that imports the module stops before its tests, and Vitest reports no test. Stryker sees no failed test, so it reports a survivor. Thus `core/load.test.ts` loads the modules of the core inside a test, and that test fails for such a mutant.

## A local run

This machine has little memory, so a local run mutates one package at a time, with two workers:

```sh
cd tools/mutation
node prepare.mjs
VEX_MUTATE=domains npx stryker run stryker.config.mjs --concurrency 2
node scores.mjs
```
