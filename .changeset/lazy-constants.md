---
"@mark1russell7/vex-compiler": patch
---

A constant of the run with a loop is lazy in a standalone module: it evaluates on its first read, with the helper `L`. Before, a module evaluated each constant before the run, also a loop in a branch that no run takes.
