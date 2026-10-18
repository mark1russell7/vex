---
"@mark1russell7/vex-compiler": patch
---

A standalone module computes a call of a function with a costly body once for each record (COMPILE.MODULE). Before, the printer counted a call as one node. Thus the call was not a column of the run, and the module computed the body again at each read. With this fix, the radial module of ireko computes the distance of each pair of neighbors once for each child.
