---
"@mark1russell7/vex-compiler": minor
---

`emitModule(expr, options)` prints a program as a standalone ES module with no import of Vex (COMPILE.MODULE). The module checks the schema of its input once. It gives the value of the interpreter at each key, or `VEX_ERROR` for an error of Vex. Each op is the text of the function of its domain, so the results have the same bits as the interpreter. The module has statements and loops. A part that depends on no key evaluates once, and an aggregate by group or by prefix evaluates its items once.
