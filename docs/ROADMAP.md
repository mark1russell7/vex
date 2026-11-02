# Roadmap

This file is the list of the open items of Vex. The Status page of the site reads its tables, and the tracker of the fleet copies them. The plan and its reasons are in [`REVIEW.md`](./REVIEW.md) §11.

Change an item here first, then on the tracker. An item that is done goes out of this file. The history of the items is in the git log and in the changelogs of the packages.

## In progress

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| GATELIMITS | Each speed-gate limit is the worst of 5 CI runs times 1.1, with the derivation in the gate. | ci | P1 | in progress | |
| COMPILE-FUSE | The compiler joins each chain of list ops into one loop, with no lists between the ops. | compiler | P1 | in progress: steps 1 to 6 merged, the cheap sort is next | |
| ENGINE | The passes of the ireko engine (measure, shapes, place) as Vex modules. | ireko | P1 | in progress: place and measure merged | |
| COEVAL16 | Vex takes `@mark1russell7/coeval` 0.17 with the client release of 2026-11-02. | core | P1 | waiting for the release of 2026-11-02 | the coeval release |
| LAYERS | The layers and tree strategies of ireko as Vex programs. | ireko | P1 | blocked | ENGINE |

## Next

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| FALLBACKSHARE | Measure the share of real programs (the pilots and the sheet examples) that tier 2 sends to tier 1. | compiler | P1 | next | GATELIMITS |
| GINSETS | A domain for the four sides of an inset. A number lifts to four sides. | domains | P2 | next | |
| GSMALL | The op `sign`, and an op that gives the unit vector of the smallest axis. | domains | P2 | next | |
| GNDGET | Tier 2 reads the `get` of `NDVectorDomain` as the `get` of a list. | compiler | P2 | next | |

## Later

| ID | Item | Area | Priority | Status | Needs |
|---|---|---|---|---|---|
| SHAPESIZE | The ireko layout bundle with the shapes module stays under 17.4 kB. | pilots | P1 | later | COMPILE-FUSE |
| TIERDEFAULT | A program of `@mark1russell7/vex` gets tier 2 by default, with no new dependency of the core. | compiler | P2 | later | FALLBACKSHARE |
| GATENOISE | The radial, tree and shapes cases of the speed gate change by 20 % to 32 % from run to run. Make them steady enough to catch a loss of 10 %. | compiler | P1 | in progress | GATELIMITS |
| RADIALGAP | The generated code of the nested radial module of ireko gets near the hand loops. Its ratio is approximately 3.85 at this time, and the target is 2.0 or less. | compiler | P1 | later | GATENOISE |
| TREEALLOC | The generated tree code allocates less for each node, so V8 has no site to tenure. The measure is the bytes and objects for each node, with a limit and no timing. | compiler | P1 | later | GATENOISE |
| INAPPRECORD | Each night, all cases of the compiler gate run in one process, and the record gives the count of slow processes. | ci | P2 | later | GATENOISE |
| MODELLIMITS | A script derives the gate limits from the recorded gate runs, with a row for each CPU model with 5 runs. The limit of other models is the worst run plus the largest spread in one model. | ci | P2 | later | GATENOISE, RADIALGAP |
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
