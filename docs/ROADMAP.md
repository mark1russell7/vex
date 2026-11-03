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
| RADIALGAP | The generated code of the nested radial module of ireko gets near the hand loops. Its ratio was approximately 3.85, and the target is 2.0 or less. | compiler | P1 | in progress: the scan of the angles gives 2.96, a profile of the fixed cost is next | |
| COMPILE-FUSE | The compiler joins each chain of list ops into one loop, with no lists between the ops. | compiler | P1 | in progress: steps 1 to 6 merged, the cheap sort is next | |
| ENGINE | The passes of the ireko engine (measure, shapes, place) as Vex modules. | ireko | P1 | in progress: place and measure merged | |
| COEVAL16 | Vex takes `@mark1russell7/coeval` 0.17 with the client release of 2026-11-02. | core | P1 | waiting for the release of 2026-11-02 | the coeval release |
| LAYERS | The layers and tree strategies of ireko as Vex programs. | ireko | P1 | blocked | ENGINE |

## Next

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| SIZERULE | The size rule: in a step of `fold` or `iterate`, the new list uses the old list at most once in its size. The rule holds at each step of the ladder. | core | P1 | in review: the check of sizes and the size rules of the ops | |
| STEPS | The checker gives the lowest step of the ladder that each program needs, with the reason. The host option `maxStep` sets the highest step that it accepts, and the default is B. A property test gives each program of the test kit the same values at A and at B. | core | P1 | next | |
| FALLBACKSHARE | Measure the share of real programs (the pilots and the sheet examples) that tier 2 sends to tier 1. | compiler | P1 | next | |
| GINSETS | A domain for the four sides of an inset. A number lifts to four sides. | domains | P2 | next | |
| GSMALL | The op `sign`, and an op that gives the unit vector of the smallest axis. | domains | P2 | next | |
| GNDGET | Tier 2 reads the `get` of `NDVectorDomain` as the `get` of a list. | compiler | P2 | next | |

## Later

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| DATALIMIT | Step B: the limit of `iterate` can come from the size of the data, for example the count of the records. | core | P1 | later | STEPS, SIZERULE |
| FIXPOINT | Step B: a fixed-point column. Its steps must move one way, and the checker examines this from the kinds of the ops. `explain` shows the rounds. | core | P1 | later | STEPS |
| DFSOP | A kernel op for a depth-first search, with the order of ties in the spec. | domains | P2 | later | |
| ASTAROP | A kernel op for the A* search, with the order of ties in the spec. | domains | P2 | later | |
| STEPC | Step C: functions that call themselves, with a budget of steps. Vex builds it only when a real consumer needs it. | core | P3 | later | FIXPOINT |
| SHAPESIZE | The ireko layout bundle with the shapes module stays under 17.4 kB. | pilots | P1 | later | COMPILE-FUSE |
| TIERDEFAULT | A program of `@mark1russell7/vex` gets tier 2 by default, with no new dependency of the core. | compiler | P2 | later | FALLBACKSHARE |
| TREEALLOC | The generated tree code allocates less for each node, so V8 has no site to tenure. The measure is the bytes and objects for each node, with a limit and no timing. | compiler | P1 | later | |
| INAPPRECORD | Each night, all cases of the compiler gate run in one process, and the record gives the count of slow processes. | ci | P2 | later | |
| MODELLIMITS | A script derives the gate limits from the recorded gate runs, with a row for each CPU model with 5 runs. The limit of other models is the worst run plus the largest spread in one model. | ci | P2 | later | RADIALGAP |
| TYPED-SCRIPTS | The JavaScript scripts become TypeScript, and the plugin launcher gets a TypeScript source. | ci | P2 | later | |
| LISTWHERE | The `where` test of a list loop can read the names of the item. | core | P2 | later | |
| MODULE-VALUES | Standalone modules for ops that give lists, for values of each kind and for records. | compiler | P2 | later | |
| GXY | The frame ops and `swap` in the XY domain. | domains | P2 | later | |
| DDSHEET | One order of the columns of a sheet, for `SheetRun` and for the compiler. | kernel | P2 | later | |
| DDCODEC | One encoding of the literals, the same as in coeval. | kernel | P2 | later | coeval |
| VEC2MOD | `Vec2Domain` in standalone modules. | compiler | P2 | later | |
| MODKEY | The keys of the records in standalone modules. | compiler | P2 | later | |
| MODMOVE | A computed move in `cell()`. | compiler | P2 | later | |
| INVPUB | A check of the packages as npm gives them. | quality | P2 | later | |
| MODEMPTYKIND | A kind for a loop that starts at an empty list. | compiler | P2 | later | |
| TIER2L | Lists in tier 2. | compiler | P3 | later | |
| C5 | The later phase of the compiler. | compiler | P3 | later | |
| DDSYNTAX | The formula syntax of Vex as a syntax profile of coeval. | kernel | P3 | later | DDCODEC |
