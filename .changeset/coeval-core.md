---
"@mark1russell7/vex": patch
"@mark1russell7/vex-testkit": patch
---

coeval is the core of Vex (decision D13 of coeval, and decision D13 in `docs/REVIEW.md`). `@mark1russell7/coeval` ^0.4.0 is the one runtime dependency of `@mark1russell7/vex`, and the build does not copy it.

- `VEX_WORLD` gives the contract of each kind of a document as data. The static kit of the kernel checks each document by it before `fromDocument` reads it (DOC.CHECK). A document that is not valid still gives `#VALUE!` with a JSON Pointer to the bad part, with the reason of the kernel. A computed key or position of a move can be a bare literal (DOC.MOVE).
- `deps` finds the reads with the static kit of the kernel (`refsOf`). Its results do not change.
- The kernel is the reference tier (EVAL.REFERENCE): `kernelPlan`, `vexMachine` and `vexSelf` evaluate a document in the kernel. `referenceEvaluate` of the test kit uses it, and the new properties P19, P20 and P21 compare the tiers with it. The test kit has `arbChangedDocument`, `arbNumberExpr` and `arbNumberSpace`.
- `toDocument` writes an expression of any depth.
- V-056: a program that is not an object, for example `0`, made `evaluate`, `explain` and a sheet with a compiler throw a `TypeError`. It gives `#VALUE!`.
