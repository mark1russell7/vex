---
"@mark1russell7/vex": minor
"@mark1russell7/vex-mcp": minor
---

A new check refuses a step of `fold` or `iterate` that uses the old lists or texts of its loop more than one time (LOOP.SIZE). For example, a step with `append(xs, xs)` doubles the list at each step. `compile`, tier 2, `emitModule` and `vex_check` refuse it.

Each op that can give a list or a text has a size rule as data (LOOP.SIZE.OPS). A domain with `size: "fixed"` gives each op a rule. A function of the host gets a rule with its property `size`. An op without a rule cannot hold a value of the loop. The new exports are `sizeError` and `ruleOf`.
