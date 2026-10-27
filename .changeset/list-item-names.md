---
"@mark1russell7/vex": patch
---

A loop over a list can name the item and its index (AXIS.LIST.ITEM). The optional field `as` of `each` and `fold` binds the value of each item, and then its position as `nth` counts it (AXIS.LIST.INDEX). The names are visible in the body and in each step, not in the test of `where` (AXIS.LIST.SCOPE). An error item stays an error item. Tier 2 gives a reason for such a program, and tier 1 evaluates it.
