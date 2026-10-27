---
"@mark1russell7/vex-compiler": patch
---

In a module of `emitModule`, an argument of an op after its receiver can be a list (COMPILE.MODULE.LIST.ARG). The op gets a frozen `vex.list`, as in the interpreter. An argument of a call can be a list too. A field of a record can be a list, and the record holds it as a `vex.list` (COMPILE.MODULE.LIST.FIELD). Before, such a program gave the reason "a list is a value of the program". A list as the receiver of an op gives the reason `a list as the receiver of the op "<name>"`, and the list ops `keys`, `values` and `errors` give `the list op "<name>"`.
