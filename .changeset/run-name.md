---
"@mark1russell7/vex-compiler": patch
---

A run name hides nothing from the code of a module. In version 0.17.2, a run with `name: "String"` hid the global from the copy of an op. Each key gave `VEX_ERROR`, and the print gave no error. A module whose code has the name prints the run under an internal name, and it exports the run with `as`. The other modules do not change. A global and a declared name of the module are good run names at this time.
