---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
"@mark1russell7/vex-mcp": patch
---

A program can calculate a fixed point. The node `fix(name, join, init, step)` makes a column with a value for each row, and `last(name)` reads the last round. The rounds repeat the step until no row changes. The joins `or` and `max` move a row up, and `and` and `min` move a row down.

A check proves that each step moves one way, from the kinds of the ops. A step without a proof gives an error with a reason before a run. The function `monotoneError` gives this reason. An op states its direction in the new field `monotone`, and a function of the host does the same. A column of `n` rows makes `n + 1` rounds at most, and a column that still changes gives `#NUM!`. `explain` shows each round. The testkit has `arbFixExpr` and `arbFixGraph`.

A program with `fix` is of step B, so `maxStep: "A"` refuses it. The interpreter and the reference tier have the construct. Tier 2 stays in tier 1 for such a program, and a standalone module refuses it with a reason.

The type `Expr` has two new tags, so a `switch` that covers each tag must change. This is why the version raises MINOR.
