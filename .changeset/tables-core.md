---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
---

The axis `table(name)` has each key of another table of the evaluation as a target (spec AXIS.TABLE). Its body and its test evaluate in the space of that table, and there the origin is the target, so a value of the first space goes in through a variable. The option `tables` of an evaluation gives the spaces by name, and the builder has `.table(name, body)`.

A `SheetRun` can have more tables (spec SHEET.TABLES): the option `tables` gives each table with its space, its columns and the formulas of its cells, and the option `name` names the main table. `cell`, `warm` and `explain` take the name of a table. One search covers the cells of all the tables, so a cycle across tables gives `#CYCLE!`. The reference interpreter and `ReferenceSheetRun` of the testkit have the tables too, and the properties P8, P15 and the scheduler property compare them with the core.
