---
"@mark1russell7/vex-compiler": patch
---

In a module of `emitModule`, `nth` keeps the items with values on the array of its list (COMPILE.MODULE.NTH.INDEX). Thus a loop that reads each item of a list with `nth` costs O(n), not O(n squared). The list of a `let` can be a key of a node of the memo. Thus a loop over the records can read that list with `nth`. Before, such a program gave the reason "a list is a value of the program".
