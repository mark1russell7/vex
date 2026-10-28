---
"@mark1russell7/vex-compiler": patch
---

A module does not copy a list without error items before a list op reads it (COMPILE.MODULE.LIST.SHARE). `append`, `flat` and `sortBy` read the array of the list. In the shapes module of ireko, these copies were approximately 30 % of the time of a call. The values do not change.
