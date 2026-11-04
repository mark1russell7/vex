---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

LOOP.SIZE accepts more steps that do not grow by a factor. A bound is the largest of some sums, so `if` and `ifError` give the larger value (LOOP.SIZE.BRANCH). A fold that copies a list item by item is valid (LOOP.SIZE.COPY). A record from the fields of one item and `take` with a literal limit have the bound of one item (LOOP.SIZE.PART). Each program that the check accepted before stays accepted, and each step that doubles a value stays refused.
