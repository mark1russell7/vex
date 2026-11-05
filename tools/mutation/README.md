# The mutation lane

The lane runs Stryker on the four published packages: `@mark1russell7/vex` (`core`), `@mark1russell7/vex-domains` (`domains`), `@mark1russell7/vex-testkit` (`testkit`) and `@mark1russell7/vex-compiler` (`compiler`). It uses Vitest 4.1, because Stryker does not support Vitest 5 at this time.

## The gate

Each package must have a mutation score of 95 % or more. Stryker has one threshold for all files, so its own break is off. The script `lane-read.ts --gate` reads the reports of all parts of a full run and applies the line to each package.

- The score of the gate counts a time-out of the clock as not found. Each line also prints the score that counts it as found. It prints the stopped mutants, the hit limit and the disabled mutants, for each package and each file.
- A part with no report is no read. A no read fails the gate, because a cancelled job gives no report.
- `lane-read.ts --flip` shows that the gate can fail. A part with a score fall and a part with no report fail, and a clean copy passes. The weekly job starts it before the gate, and `gate-flip.yml` starts it for a change of the script.

The read of each package also prints its static mutants: the count, and the tests that they completed. The report of Stryker has no time for one mutant, so this count is not a time. A static mutant also loads each module again, and the count leaves that out.

## The parts

Each job has one part, so that each job stays in its time limit of 150 minutes. The maximum of 3 jobs at one time holds over all parts of a run, because all parts are one matrix.

| Part | Files |
|---|---|
| `core.kernel` | The modules of the kernel of coeval: `kernel.ts`, `plan.ts`, `same.ts`, `document.ts`, `deps.ts` and `write.ts` |
| `core.base.1` to `core.base.4` | The other modules of the core, by size |
| `domains.1` to `domains.3` | The modules of the domains, by size |
| `testkit` | The test kit |
| `compiler.module.1` and `compiler.module.2` | `module.ts`, by lines, with each end at the end of a method |
| `compiler.rest.1` to `compiler.rest.4` | The other modules of the compiler, by size |

`layout.ts` gives the parts. The variable `VEX_MUTATE` names the packages or the parts of a run. It also takes a whole group, for example `core.base`, or one module of the domains, for example `domains.schema`.

The clock limit of one mutant is the net time of the first run, times 1.5, plus 120 s. `coverageAnalysis` is `perTest` on each part. Thus only a static mutant starts all tests. The lane does not ignore static mutants, because a survivor in a static mutant is a real survivor.

## The weekly run and the nights

The workflow `mutation-weekly.yml` reads each part on Saturday and holds the gate. The role `vex` reads a red run: `schedule-watch` of the fleet gives it to the row of that role.

The nightly job reads only the files that changed on the main line in the last 25 hours. A changed test file also selects the source file of the same name. The nightly job is report only by design. It prints the score, the time-outs and the survivors of each file, and a score fails nothing.

A survivor in a changed file shows on the next night. A fault with no change in its own file shows at the next weekly run, at most 7 days later (`LANE.DELAY`). A weaker test with another name is an example. A page with a score states the date of its run, and a score older than 7 days reads stale.

A dispatch of `nightly.yml` can name parts in the input `packages`. A dispatch of `mutation-weekly.yml` reads each part.

## The dry run

A part that fails its first test run gives no report, and the gate reads that as no read. The workflow `lane-dry-run.yml` starts this first test run on each part, for a change of the files of the lane (`LANE.DRYRUN`). This shows the fault before the merge. The dry run gives no score, and it does not show if a part stays in its time limit.

## The load check

A test file that does not load gives no failed test. Stryker then reports a score, or it stops with `No tests were executed`. The script `load-check.ts` collects each test file of the copy before Stryker starts. A file that does not load, or that holds no test, fails the lane with the words `No read`.

The job `mutation load check flip` of the nightly workflow shows that this check can fail. An added file with a missing package fails the check, and the same copy without that file passes.

The test `V-090` of `mutation-lane.test.ts` runs in CI on each pull request. It fails when a copied file imports a package that the lane does not have.

The test `V-091` of that file also runs in CI. It fails when the configuration of a package with tests in the copy has a setup file that is not in `SETUP_FILES` of `layout.ts`. A test of the lane must read what the same test reads in CI.

## Type checks

Stryker adds `// @ts-nocheck` to each file of its sandbox by default. The lane turns this off (`disableTypeChecks: false`), because Vitest does no type check. Also, the golden source files of the compiler must stay as they are.

## The modules of the compiler

A standalone module copies the text of each op function of a domain. A mutated domain has the code of Stryker in that text, so the module refuses the op. Thus each test file of the compiler that prints a module gets `@mark1russell7/vex-domains` from the copy that Stryker does not mutate. These tests stop no mutant of the domains. A dry run names each failed test, because `disableBail` is on for a dry run. On 2026-10-19, a test in `tiers.test.ts` emitted a module, and the dry run of the domains failed.

### The rule of the two copies

The rule reads what the test declares. `printsModule` of `layout.ts` follows the relative imports of the test file. A test prints a module if those imports reach `module.ts`. An import of a type and a comment load no file, so the rule does not read them. A new test file needs no change: its imports classify it.

`plainFaults` of `layout.ts` refuses each file that the rule cannot classify, and the test `LANE.PLAIN` fails on a refusal in normal CI. Each row gives its own reason:

| The file | The reason |
|---|---|
| A test of the compiler with a computed import that the list `COMPUTED_IMPORTS` does not name | The rule cannot read what the import loads. |
| A test of the compiler that names `emitModule`, and its imports do not reach `module.ts` | The printer comes by another path. |
| A test outside the top folder of the compiler that reaches the printer | The rule gives the plain copy only in that folder. |
| A test that reads the pilots and does not print a module | The test reads two copies of the domains. |
| A file that is not a test, outside the domains and the pilots, that imports the domains | A test that prints a module then reads two copies. |

`COMPUTED_IMPORTS` names each permitted computed import and the file it loads. A name with no computed import is a fault too. The job `Flip of the gate of the mutation lane` injects each fault and reads its reason, and a clean copy gives no fault.

### Classes across the two copies

No test reads a class across the two copies. Each domain tests its class with `instanceof`, so a value from the other copy gives a different result. A test file loads one copy only: `plainFaults` holds this. Stryker does not set `isolate`, so the default of Vitest gives each test file its own context (a read of the source of the runner). Thus the lane does not read `instanceof` across the two copies, and its dry run says nothing about it.

### The method changed for `domains`

A score of `domains` before the first read of 2026-11-07 used another method. The 13 test files of `LANE.PLAIN` read the mutated copy then, and those tests can stop a mutant of the domains. The tests of these files stop no such mutant at this time. So the score can fall with no change in the code. Do not compare `domains` across this change without this mark. `lane-read.ts` prints the mark with each read.

## The files that the lane does not mutate

| File | Reason |
|---|---|
| `*.test.ts`, `core/test-support.ts`, `testkit/fc-setup.ts` | These files are tests and test setup. |
| `*/index.ts` | These files only export other files. |
| `testkit/arbitraries.ts` | This file generates test data. A mutant changes the distribution of the data, not a behavior that a test can check. |
| `testkit/builder-model-arbitraries.ts` | This file generates the calls of the builder model test, for the same reason. The model and the runner are in `builder-model.ts`, and the lane mutates them. |

## A module that does not load

A mutant at the top level of a module can make the module throw when it loads. Then each test file that imports the module stops before its tests, and Vitest reports no test. Stryker sees no failed test, so it reports a survivor. Thus `core/load.test.ts` loads the modules of the core inside a test, and that test fails for such a mutant.

A test file with an import that finds no file in the copy also does not load. `layout.ts` lists each folder that `prepare.mjs` copies. Then `prepare.mjs` fails for each relative import that finds no file in the copy (V-072). When a test reads a file of another folder of the repository, add that folder to `COPIES`.

## A local run

This machine has little memory, so a local run mutates one package at a time, with two workers:

```sh
cd tools/mutation
node prepare.mjs
VEX_MUTATE=domains npx stryker run stryker.config.mjs --concurrency 2
node lane-read.ts
```

## The disabled mutants

A comment `// Stryker disable next-line <Mutator>: <reason>` disables a mutant that is equivalent. The disable raises the score, so each one is also in `disables.json`, with its reason. The script `disables.mjs` gives the number of disables of each file. It fails when the sources and `disables.json` are not the same. `pnpm lint` and the nightly lane start it. After you add or remove a disable, start `node tools/mutation/disables.mjs --write` and examine the diff of `disables.json`.
