---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

The body of a `let` of an append can read the new list with `get`, or as a list in an argument or a field. A later step can then append to that list. In a module, such a read gave the old items of the list (V-096). The helpers `GT`, `LV` and `LVC` count the items of their cache, so the module gives the values of the interpreter.
