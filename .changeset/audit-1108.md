---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
---

The plan of a document checks the nesting before the checks that recurse, as `evaluate` does (V-097). A document of more than 500 levels gets the error of nesting, and no `RangeError`. In the fast path of an op, a word after `?.` is the name of a key (V-098). A module keeps that name.
