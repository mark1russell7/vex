---
"@mark1russell7/vex": patch
"@mark1russell7/vex-testkit": patch
---

coeval is the core of Vex (decision D13 of coeval, and decision D13 in `docs/REVIEW.md`). `@mark1russell7/coeval` ^0.4.2 is the one runtime dependency of `@mark1russell7/vex`, and the build does not copy it.

- `VEX_WORLD` gives the contract of each kind of a document as data. The static kit of the kernel checks each document by it before `fromDocument` reads it (DOC.CHECK). The check uses `vexChecker`, a machine without the code of the evaluators, so a bundle that only reads documents does not hold them. A document that is not valid still gives `#VALUE!` with a JSON Pointer to the bad part, with the reason of the kernel. A computed key or position of a move can be a bare literal (DOC.MOVE).
- `deps` finds the reads with the static kit of the kernel (`refsOf`). Its results do not change.
- The kernel is the reference tier (EVAL.REFERENCE). `kernelPlan` gives the plan of a program in the kernel with `vexMachine`. The plan has `run`, `evaluate`, `reference` and `agree`. `reference` reads the document with the reference interpreter of the kernel, which compiles nothing. `agree` compares the tiers of the kernel with a tier that you give (EVAL.AGREE). `vexDefinitions` gives the definitions of the formula kit for the reference interpreter.
- `referenceEvaluate` of the test kit uses the reference interpreter of the kernel. It takes a document too, and the options `vars` and `extensions`. The test kit has `arbChangedDocument`, `arbNumberExpr` and `arbNumberSpace`. The properties P19 to P22 compare the tiers with the kernel, and P17 compares the compiler with it too.
- `toDocument` writes an expression of any depth.
- V-056: a program that is not an object, for example `0`, made `evaluate`, `explain` and a sheet with a compiler throw a `TypeError`. It gives `#VALUE!`.

The API only grows, and no export changes its type, so the level is patch (SemVer before 1.0).
