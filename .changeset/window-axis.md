---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
"@vex/formula": minor
"@vex/sheet-app": minor
---

The axis `window(from, to)` has the keys at the offsets from `from` to `to` of the focus, in order (spec AXIS.WINDOW). In a tree space, the offsets go among the siblings. The builder has `.window(from, to, body)`, and the JSON Schema of the IR has the axis. The arbitraries and the builder model of the testkit make windows too, and the property P14 checks the targets.

The formula language writes the axis as `rows(from, to)`, for example `AVERAGE(rows(-2, 0).Sales)` (spec FORMULA.AGGREGATE.WINDOW). The sheet app has a new example, monthly sales, with a moving average, a total for the year and the best month so far.
