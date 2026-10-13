# The mutation lane

The lane runs Stryker on the four published packages: `@mark1russell7/vex` (`core`), `@mark1russell7/vex-domains` (`domains`), `@mark1russell7/vex-testkit` (`testkit`) and `@mark1russell7/vex-compiler` (`compiler`). It uses Vitest 4.1, because Stryker does not support Vitest 5 at this time.

## The gate

Each package must have a mutation score of 95 % or more. Stryker has one threshold for all files, so its own break is off. The script `scores.mjs` gives the score of each package, and it fails when a package is under 95 %.

A run with `--mutate` mutates only some packages. Then `scores.mjs` applies the gate to those packages only.

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
npx stryker run stryker.config.json --mutate "work/domains/**/*.ts,!work/**/*.test.ts,!work/*/index.ts" --concurrency 2
node scores.mjs
```
