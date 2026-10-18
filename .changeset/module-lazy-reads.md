---
"@mark1russell7/vex-compiler": patch
---

In a standalone module, a constant of the run that reads a lazy constant, or calls a function with a loop, is lazy too (COMPILE.MODULE). Before, it evaluated before the run and started that loop, also when the run did not need it.
