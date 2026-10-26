---
"@mark1russell7/vex-compiler": patch
---

A standalone module takes the lists of design E (COMPILE.MODULE.LIST). It has the list ops `drop`, `append`, `without`, `flat`, `get` and `indexOf`. It has list literals, a list op over a `let` and lists as names of `fold` and `iterate`. The module prints plain loops and arrays.

A program with these constructs gave a reason before. At this time it gives a module. The reason `the list op "…" is not in a module yet` is gone. New reasons tell the constructs that a module does not take.

The level is PATCH: no exported type changes. Before 1.0, a new feature is a PATCH.
