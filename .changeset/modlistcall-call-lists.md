---
"@mark1russell7/vex-compiler": patch
---

In a module of `emitModule` and `emitSheetModule`, the value of a call can be a list (COMPILE.MODULE.LIST.CALL). A list op, the axis `list`, a fold, a field and an argument of an op take the list of a call. Before, such a program gave the reason "a list is a value of the program". Each kind of the arguments has its own function, with the facts of its list. A list of a call at a place that takes no list still gives that reason. An op of a domain whose value is a list still gives a reason, because the kind of a result cannot tell a list.
