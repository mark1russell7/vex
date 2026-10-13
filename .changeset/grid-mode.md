---
"@vex/formula": minor
"@vex/sheet-app": minor
---

The sheet app has grids (spec FORMULA.GRID.ADDRESS, FORMULA.GRID.RANGE and FORMULA.GRID.ONLY). The columns of a grid have the letters A, B, C, and each cell keeps its text as its own formula. A text that starts with `=` is a formula. In a grid, `B2` and `$B$2` read a cell, an empty cell reads as 0, and an aggregate takes a range like `SUM(B2:D4)`. A range expands to a balanced tree of the cells that it reads, so it needs no new IR, and a cycle gives `#CYCLE!`. The button **New grid** starts a grid, and the price list is an example.
