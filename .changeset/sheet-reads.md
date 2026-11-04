---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
---

The kernel exports `readsOf`, `columnOrder`, `isCellRef` and the type `Direction`. `SheetRun` and the module of the compiler use these functions in place of two copies. The results and the errors do not change.
