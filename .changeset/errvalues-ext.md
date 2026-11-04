---
"@mark1russell7/vex-compiler": patch
---

Fix: tier 2 gave the value of `ifError` where the interpreter gives `#DEPTH!` (V-066). The same fix covers a list op with a failed check at an earlier item (V-067).

In tier 2, an error of an extension that the program catches stays in tier 2 (COMPILE.EXT). `ifError` gives its second argument, and a list op skips the error item. `#DEPTH!` of an extension still goes to tier 1. An extension in a later argument keeps its `#DEPTH!`, also after an error of an earlier argument.
