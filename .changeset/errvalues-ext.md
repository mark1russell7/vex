---
"@mark1russell7/vex-compiler": patch
---

In tier 2, an error of an extension that the program catches stays in tier 2 (COMPILE.EXT). `ifError` gives its second argument, and a list op skips the error item. `#DEPTH!` of an extension still goes to tier 1. An extension in a later argument keeps its `#DEPTH!`, also after an error of an earlier argument.
