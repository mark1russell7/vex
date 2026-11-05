---
"@mark1russell7/vex-compiler": patch
---

V-093: the check of a copy of a function of a domain reads `Infinity`, `-Infinity`, `NaN` and `undefined` inside data. It also reads the items of a `Map` or a `Set`. A module refuses a copy that differs in this way.
