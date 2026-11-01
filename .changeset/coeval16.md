---
"@mark1russell7/vex": minor
---

The core takes `@mark1russell7/coeval` `^0.17.0`, thus the types that it exports from coeval change, but no result of a Vex program changes. In coeval 0.17.0, `conforms` also checks the truth of `formula.if`, `formula.and` and `formula.or` for a profile with its own truthy and a `truthType` (D86).
