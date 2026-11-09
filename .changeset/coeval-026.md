---
"@mark1russell7/vex": minor
"@mark1russell7/vex-compiler": minor
---

Vex and the compiler use `@mark1russell7/coeval` `^0.26.1`, not `^0.21.0`. Each minor of coeval from 0.22.0 to 0.26.0 changes behavior that a host can see. One change is that a deep recursion through closures in a coeval document gives `#DEPTH!` at a lower depth. So this change is a MINOR. The API of Vex does not change.
