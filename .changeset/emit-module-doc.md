---
"@mark1russell7/vex-compiler": patch
---

The doc of `emitModule` states that it is a tool of a build. A print of one module of ireko takes 16 to 172 ms on a CI runner, at 0.833 to 1.149 times a fixed base. A caller on a request path keeps the printed module. A limit of the gate holds the cost of today, and the target of 1.10 for each module is not proven.
