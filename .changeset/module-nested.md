---
"@mark1russell7/vex-compiler": patch
---

A standalone module takes a list op over an item of a list of lists (V-074, COMPILE.MODULE.LIST.NESTED). A variable of the schema can have a `ListKind` (COMPILE.MODULE.LIST.VAR), for example `{ vars: { froms: { list: "number" } } }`. This change raises PATCH, because the fix and the new optional form are backward compatible, and a package at `0.y.z` raises PATCH for a feature.
