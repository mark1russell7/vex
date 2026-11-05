# Roadmap

This file is the list of the open items of Vex. The Status page of the site reads its tables, and the tracker of the fleet copies them. The plan and its reasons are in [`REVIEW.md`](./REVIEW.md) §11.

Change an item here first, then on the tracker. An item that is done goes out of this file. The history of the items is in the git log and in the changelogs of the packages.

## The steps of Vex (decision of 2026-11-02)

Mark chose a ladder of steps with a setting. The study is on the tracker of the fleet (`vex-recursion-study`).

- Step A is a total formula language: each loop has a fixed count. Step B adds limits from the data and fixed points through monotone steps. Step C adds functions that call themselves, with a budget.
- The checker gives the lowest step that a program needs. The host option `maxStep` sets the highest step that it accepts. A document cannot raise its own step.
- A setting changes which programs the host accepts. It does not change the value of an accepted program at any time. Thus the size rule, EVAL.PURE and P17 hold at each step, and the test P17 examines each step.
- `vex_check` gives the step and its reason. A refusal names the step that the program needs. `explain` shows the step at the root.
- FN.TOTAL is the rule of A and B. Design E (a list as the state of `iterate`) is an A construct with its constant limit. B adds limits from the data next to it.
- A fixed point is an explicit construct. A cycle of cells without it gives `#CYCLE!` at each step, so the step does not change its value.
- The ladder of steps is generic, so it goes into coeval (D13). Vex declares the step of each construct.

## In progress

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| KEYSCOPE | A shared constant of a module follows the scopes of its names, so two expressions with one text and different bindings keep different values (V-078, V-080). | compiler | P0 | in progress | |
| CATCHFAULT | A print-time refusal of a fault that a catch can hide. The runtime check is dropped, and #278 is closed. | compiler | P1 | later: after 0.18.0 | |
| COMPILE-FUSE | The compiler joins each chain of list ops into one loop, with no lists between the ops. | compiler | P1 | in progress: steps 1 to 8 merged, the size of the printer is #242 | |
| ENGINE | The passes of the ireko engine (measure, shapes, place) as Vex modules. | ireko | P1 | in progress: place and measure merged | |
| TREEALLOC | The generated tree code allocates less for each node, so V8 has no site to tenure. The measure is the bytes and objects for each node, with a limit and no timing. | compiler | P1 | in progress: the measure is next | |
| NIGHTLY1103 | The Nightly of 2026-11-03 is green again. | quality | P1 | in progress: #206 | |

## Next

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|

## Later

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| PLACESSPREAD | Find the cause of the spread of the rows of the places gate. | compiler | P3 | later | KEYSCOPE |
| SHARE49 | Find the cause of the share job that stopped after 49 minutes on 11-04. The cause stays open. | compiler | P3 | later | KEYSCOPE |
| GRADIENT | The derivative of a program against a variable, as a transform of the program. | core | P3 | later: #270 | |
| DFSOP | A kernel op for a depth-first search, with the order of ties in the spec. | domains | P2 | later | |
| ASTAROP | A kernel op for the A* search, with the order of ties in the spec. It gives the `avoid` router of ireko after 0.18.0. Its prediction has a target ratio over the same 4000 seeded edges, with hand code and an A/A arm. | domains | P2 | later | 0.18.0 |
| STEPC | Step C: functions that call themselves, with a budget of steps. Vex builds it only when a real consumer needs it. | core | P3 | later | |
| TIERDEFAULT | A program of `@mark1russell7/vex` gets tier 2 by default, with no new dependency of the core. The pilots get tier 2 for 94 % of their programs, but the programs that sessions write get it for 43 % to 78 %. | compiler | P2 | later | LISTVALUES |
| COLUMNSCOPE | A column of a sheet can apply to some rows of a tree. At this time, a column runs at each row, and the user pays for cells that nobody reads. | core | P2 | later | |
| INAPPRECORD | Each night, all cases of the compiler gate run in one process, and the record gives the count of slow processes. | ci | P2 | later | |
| MODELLIMITS | A script derives the gate limits from the recorded gate runs, with a row for each CPU model with 5 runs. The limit of other models is the worst run plus the largest spread in one model. | ci | P2 | later | |
| TYPED-SCRIPTS | The JavaScript scripts become TypeScript, and the plugin launcher gets a TypeScript source. | ci | P2 | later | |
| LISTWHERE | The `where` test of a list loop can read the names of the item. | core | P2 | later | |
| MODULE-VALUES | Standalone modules for ops that give lists, for values of each kind and for records. | compiler | P2 | later | |
| GATEPERCPU | A limit of the speed gate for each CPU model. | ci | P2 | later | |
| XEONLINE | A speed line for a Xeon from 5 runs of main. | ci | P2 | later | |
| GXY | The frame ops and `swap` in the XY domain. | domains | P2 | later | |
| DDCODEC | One encoding of the literals, the same as in coeval. | kernel | P2 | later | coeval |
| TIER2L | Lists in tier 2. | compiler | P3 | later | |
| C5 | The later phase of the compiler. | compiler | P3 | later | |
| DDSYNTAX | The formula syntax of Vex as a syntax profile of coeval. | kernel | P3 | later | DDCODEC |
