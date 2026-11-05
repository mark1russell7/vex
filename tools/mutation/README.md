# The mutation lane

The lane runs Stryker on the four published packages: `@mark1russell7/vex` (`core`), `@mark1russell7/vex-domains` (`domains`), `@mark1russell7/vex-testkit` (`testkit`) and `@mark1russell7/vex-compiler` (`compiler`). It uses Vitest 4.1, because Stryker does not support Vitest 5 at this time.

## The gate

Each package must have a mutation score of 95 % or more. Stryker has one threshold for all files, so its own break is off. The script `lane-read.ts --gate` reads the reports of all parts of a full run and applies the line to each package.

- The score of the gate counts a time-out of the clock as not found. Each line also prints the score that counts it as found. It prints the stopped mutants, the hit limit and the disabled mutants, for each package and each file.
- A part with no report is no read. A no read fails the gate, because a cancelled job gives no report.
- `lane-read.ts --flip` shows that the gate can fail. A part with a score fall and a part with no report fail, and a clean copy passes. The weekly job starts it before the gate, and `gate-flip.yml` starts it for a change of the script.

The read of each package also prints its static mutants: the count, and the tests that they completed. The report of Stryker has no time for one mutant, so this count is not a time. A static mutant also loads each module again, and the count leaves that out.

## The tests of a part

A score can come from a part of the tests, so the read prints the tests of each part beside its score (`LANE.TESTS`). The count comes from the field `testFiles` of the report. A part reads the test files that reach its mutated files, so this count depends on these files. A compare holds only for a full part. A night prints its count and compares nothing.

The weekly job saves the file `lane-tests.json` as the artifact `lane-tests`, and the next weekly job reads the newest such artifact of the main line. A part that fell or that gave no report keeps its old count. The repository holds no count.

A fall of more than 20 % reads `no read: tests fell`, and the gate fails. A pull request that removes tests on purpose adds an entry to `planned-falls.json`. The entry names the part, the old count, the new count and the pull request. An entry holds only while the last good read equals its old count.

**The 20 % is a first guess from very few falls.** The largest fall with no fault is 7.1 %: `compiler.module` went from 295 to 274 when tests moved to another file. The fall of V-090 is 48.3 %. Read the line again after 4 Saturdays, and bring each fall between 7 % and 20 % to the strategist.

**Growth can hide a real fall.** The `compiler.rest` read had 563 tests, then 1029 with the fault of V-090, then 1990 with no fault. A compare with the last good read passes the 1029. So the flip with the real counts shows that the rule can fail. It does not show that the rule finds V-090. The load check holds that fault.

## The test files of a part

A check by name does not depend on growth (`LANE.FILES`). The load check asks Vitest for the test files that the runner of Stryker selects for the mutated files of all parts. A test file on the disk that this selection leaves out fails the check. The check prints `no read: file not read`. The list `NOT_READ` of `layout.ts` states why a file is an exception, and an entry that is not true fails the check too.

The gate reads the same question from the reports of a full run. It compares the test files on the disk with the field `testFiles` of all parts. A dry run gives no report. So the load check holds this question on each pull request, and the gate holds it on each weekly run.

These are two reads of one question, and they can differ. The load check saves its selection, and each job copies it beside its report as `load-selection.json`. A file in one read and not in the other reads `no read: the two reads differ`. The gate does not pick one of the reads.

A walk of the imports has a limit. A test can reach a mutated file only by a computed dynamic import, a spawned process or a read of a file. That test is outside the selection. The runner of Stryker uses the same selection, so that test stops no mutant of that file. The words `file not read` are true of the lane. They do not state that the test does not reach the file. The flip of the load check has one row for a computed path and one row for a literal path. It prints the result of each.

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

The flip of this check is a real failed job. On 2026-11-05 the dry run of `compiler.module` read V-090 in [job 127041253282](https://github.com/mark1russell7/vex/actions/runs/41962557467/job/127041253282). The parts of the same check on the fixed tree are the clean copy. This check reads only the dry run. It does not read a score.

## The load check

A test file that does not load gives no failed test. Stryker then reports a score, or it stops with `No tests were executed`. The script `load-check.ts` collects each test file of the copy before Stryker starts. A file that does not load, or that holds no test, fails the lane with the words `No read`.

The job `mutation load check flip` of the nightly workflow shows that this check can fail. The job `Flip of the load check of the mutation lane` of `gate-flip.yml` does the same on a pull request. Each row reads the reason text, so a red for another fault does not pass. A missing package fails the check, direct and through an imported file. A file with no test fails it with its own reason. A test file on the disk that does not reach the copy fails it. A test file in the copy that no part selects also fails it. A test file whose only path to a mutated file is a computed dynamic import also fails it. The same copy without these files passes.

The check starts each test file with the option `COLLECT_OPTIONS` of `layout.ts`. No form of `collect` reads both faults. The form that starts a file reads a load fault. A file with no test then has no children, so the check reads that as a second row.

Under Vitest 5 the default form only parses a file. The lane is on 4.1.12, where the default form starts a file, so the option has no effect here. The script `load-run-flip.ts` reads the option on Vitest 5, and it fails if the option goes missing. Each read prints the version of the runner and its folder.

The test `V-090` of `mutation-lane.test.ts` runs in CI on each pull request. It fails when a copied file imports a package that the lane does not have.

The test `V-091` of that file also runs in CI. It fails when the configuration of a package with tests in the copy has a setup file that is not in `SETUP_FILES` of `layout.ts`. A test of the lane must read what the same test reads in CI.

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
