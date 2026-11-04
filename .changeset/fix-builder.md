---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

A chain has the method `fix(name, join, init, step)`. It makes a fixed-point column, as `iterate` makes a loop. The step gets a chain of the last round, so a program of the builder has no read of `last` outside a column. The join gives the kind of the chain, and the core exports the type `FixValue`.
