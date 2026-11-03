---
"@mark1russell7/vex-compiler": patch
---

A module of a tree space allocates less. A forward loop over `ancestors` walks up the parents with no array, the output array of a run has its length before the first key, and the order of a tree uses `Int32Array`. The values do not change.
