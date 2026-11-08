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
| `compiler.module.1` to `compiler.module.6` | `module.ts`, by the cost of its segments in `costs.json`, with each end at the end of a method |
| `compiler.rest.1` to `compiler.rest.4` | The other modules of the compiler, by size |

`layout.ts` gives the parts. The variable `VEX_MUTATE` names the packages or the parts of a run. It also takes a whole group, for example `core.base`, or one module of the domains, for example `domains.schema`.

The clock limit of one mutant is the net time of the first run, times 1.5, plus 120 s. `coverageAnalysis` is `perTest` on each part. Thus only a static mutant starts all tests. The lane does not ignore static mutants, because a survivor in a static mutant is a real survivor.

## The weekly run and the nights

The workflow `mutation-weekly.yml` reads each part on Saturday and holds the gate. The role `vex` reads a red run: `schedule-watch` of the fleet gives it to the row of that role.

The nightly job reads only the files that changed on the main line in the last 25 hours. A changed test file also selects the source file of the same name. The nightly job is report only by design. It prints the score, the time-outs and the survivors of each file, and a score fails nothing.

A survivor in a changed file shows on the next night. A fault with no change in its own file shows at the next weekly run, at most 7 days later (`LANE.DELAY`). A weaker test with another name is an example. A page with a score states the date of its run, and a score older than 7 days reads stale.

A dispatch of `nightly.yml` can name parts in the input `packages`. A dispatch of `mutation-weekly.yml` reads each part.

## The dry run

A part that fails its first test run gives no report, and the gate reads that as no read. The workflow `lane-dry-run.yml` starts this first test run on each part, for a change of the files of the lane (`LANE.DRYRUN`). This shows the fault before the merge. The dry run gives no score.

A part that passes its first test run stops after its plan. The reporter `lane-cost` writes the plan and stops Stryker. The plan has the planned net time of each line of each file. The job prints the estimate of the clock of the part. The estimate is the planned net time divided by 9.8, the lowest value of the two parts that Nightly 42443362759 stopped. An estimate over 100 minutes has a mark and a warning. A slow runner also ends a part under that target before its stop of 140 minutes.

The plan also gives the 40 tests of the largest cost (`tests`: name, file, time, runs, cost). The cost of a test is its time in the first test run, times the runs of mutants that start it. A static mutant starts each test, so a static mutant adds the time of each test. A test with a large cost is the first place to make the lane faster.

A dry run fails when its plan has more than 600 static runs in `module.ts` (`LANE.STATIC`). Code outside a test, for example an emit in the body of a `describe` or a table of text at the top of a file, gives a static mutant. A static mutant starts each test, so its cost is the time of all tests. On 2026-11-08 the dry run 42460046693 read 4232 static runs in `module.ts`. After the fix, the dry run 42474174486 read 471. Move such code into a test, a `beforeEach` or a function.

`costs.json` holds the cost of each segment of `module.ts` from the dry run 42474174486. Start `node tools/mutation/cost-map.ts <run> <folder>...` after a large change of `module.ts` or of its tests, and commit the new map. A test fails when the estimate of a part is over 100 minutes under the committed map.

The flip of this check is a real failed job. On 2026-11-05 the dry run of `compiler.module` read V-090 in [job 127041253282](https://github.com/mark1russell7/vex/actions/runs/41962557467/job/127041253282). The parts of the same check on the fixed tree are the clean copy. This check reads only the dry run. It does not read a score.

## The stop and the partial score

A job of a full run stops its part after 140 minutes, 10 minutes under the limit of the job. The upload of the costs then has time (`LANE.COST`). A part that reaches its stop gives the partial score of the mutants that ended (`LANE.PARTIAL`). The file `partial.json` of its artifact keeps that read, and the summary of the job shows it with the mark `PARTIAL`.

A partial score is not a score. Stryker does not choose the mutants that end first at random. So the gate reads such a part as no read, and the job fails. The gate prints the partial read beside the line of the no read.

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

A standalone module copies the text of each op function of a domain. A mutated domain has the code of Stryker in that text, so the module refuses the op. Thus each test file of the compiler that prints a module gets `@mark1russell7/vex-domains` from the copy that Stryker does not mutate. These tests stop no mutant of the domains. A dry run names each failed test, because `disableBail` is on for a dry run. On 2026-10-19, a test in `tiers.test.ts` emitted a module, and the dry run of the domains failed.

### The rule of the two copies

The rule reads what the test declares. `printsModule` of `layout.ts` follows the relative imports of the test file. A test prints a module if those imports reach `module.ts`. An import of a type and a comment load no file, so the rule does not read them. A new test file needs no change: its imports classify it.

The rule has one stated limit. The walk follows relative imports only, so an import of a package that reaches the printer stays outside the rule. `plainFaults` refuses an import of the compiler by its package name only outside the top folder of the compiler. No test file has such an import at this time, and no gate holds this limit.

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
