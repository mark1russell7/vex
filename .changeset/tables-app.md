---
"@vex/formula": minor
"@vex/sheet-app": minor
---

A document of the sheet app is a book of tables, with a tab for each table (spec FORMULA.TABLE.AXIS, FORMULA.TABLE.ROW and FORMULA.TABLE.ERRORS). A formula reads another table with `table("title")`: an aggregate over its rows, for example `SUM(table("Products") WHERE Name = this.Item, Price)`, or one row by its name, `table("Products").row("Ink").Price`. Inside the axis of another table, `this.name` reads the row of the formula through a variable. One run has all the tables, so a cycle across tables gives `#CYCLE!`. The JSON file, the share link and the save in the browser keep each table, and the JSON of one table opens as a book with one table. The new example has orders and products.
