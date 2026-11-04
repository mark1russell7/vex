---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

Tier 2 and the standalone modules lower a fixed point. A program with `fix` runs in tier 2 with the result of tier 1. This includes each error value of a row and the failure at the round limit. `emitModule` and `emitSheetModule` make a module of such a program, in place of a refusal.

The core exports `fixRounds`, `fixValueError`, `joinKind` and `worstRow` for the compiler. The testkit has `arbFixProgram`, the generator of the test of the tiers.

A module refuses a column at a key of a literal or of `fill`, because a module has no record at such a key.
