---
"@mark1russell7/vex-compiler": patch
---

A sheet module with no search has no function for a column (COMPILE.MODULE.ONCE). The code of each formula is in its loop over the keys, so a run makes no functions and starts none. Columns with the same order of the keys share one loop when each read of an earlier column of the loop reads a finished cell. A run of the measure module of ireko is approximately two times faster, and the module is 61 bytes smaller after minify and gzip.

The level is PATCH: the exported function and its signature do not change, and the results stay the same. Only the text of the module changes.
