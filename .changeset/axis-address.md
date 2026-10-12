---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
---

Fix V-043: the moves before an axis are now the address of the axis, so `parent().children(body)` evaluates `body` at each child of the parent. Before, the builder dropped the moves, and the axis started at the origin. The IR node `each` has an optional address `at` (spec AXIS.ADDRESS), `deps` gives the address of each axis, and the test kit generates and checks axes with an address (property P12).
