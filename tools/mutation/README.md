# The mutation lane

The lane runs Stryker on the four published packages: `@mark1russell7/vex` (`core`), `@mark1russell7/vex-domains` (`domains`), `@mark1russell7/vex-testkit` (`testkit`) and `@mark1russell7/vex-compiler` (`compiler`). It uses Vitest 4.1, because Stryker does not support Vitest 5 at this time.

## The gate

Each package must have a mutation score of 95 % or more. Stryker has one threshold for all files, so its own break is off. The script `scores.mjs` gives the score of each package, and it fails when a package is under 95 %.

The variable `VEX_MUTATE` names the packages of a run, for example `compiler` or `core,domains`. Without it, a run mutates the four packages. Then `scores.mjs` applies the gate to the packages of the run only.

## The nightly job

The nightly job has one runner for each package. Each runner has a time limit of 150 minutes, and it keeps its report as the artifact `mutation-report-<package>`.

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

## A local run

This machine has little memory, so a local run mutates one package at a time, with two workers:

```sh
cd tools/mutation
node prepare.mjs
VEX_MUTATE=domains npx stryker run stryker.config.mjs --concurrency 2
node scores.mjs
```
