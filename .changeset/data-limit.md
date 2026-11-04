---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
"@mark1russell7/vex-mcp": patch
---

The limit of `iterate` can come from the size of the data. `dataLimit(axis)` gives the number of targets of an axis, and the axis `list` gives the count of a list. The builder also takes a list chain. The interpreter, tier 2 and standalone modules give one value, and a limit that is not valid gives `#NUM!` of the kind `limit`.

A program with a data limit is of step B, so `maxStep: "A"` refuses it. A limit that is a number stays at step A.

The field `limit` of the type of an `iterate` node has a wider type, so code that reads it as a number must change. This is why the version raises MINOR.
