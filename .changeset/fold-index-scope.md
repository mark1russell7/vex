---
"@mark1russell7/vex": patch
---

The step of a fold of the builder can hold a list chain with its own index, also a chain from outside the fold. Before, over an axis that is not a list, such a fold threw a `TypeError` (V-065).
