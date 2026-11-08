---
"@mark1russell7/vex-compiler": patch
---

The source of tier 2 keeps one depth of blocks as a program grows (V-089). Thus the parse of `load` grows with the lines only. The chains of arguments share one value block. The first statements of a block move out of it. A node inside a node of the memo with no keys has no memo of its own.
