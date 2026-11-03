---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": minor
---

The generated code of `@mark1russell7/vex-compiler` gives the error result of a program itself, with `#ARGS` too. It keeps a small record of each failure, and a materialize step builds the error with the error texts of the core. The core exports these texts as `errorText`, `errorAt` and `noKeyError`. A run that tier 2 ends with an error does not count as a fallback. The tiers give the same results as before. The compile of a program with a chain of functions does not take exponential time in a context that catches an error (V-068).
