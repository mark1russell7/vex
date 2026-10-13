# The Vex sheet app: a proposal

*Written: 2026-10-11. Status: accepted. §8 gives the decisions of the owner.*

## 1. The idea

Vex is the semantics of a spreadsheet without the grid on the screen. The sheet app makes Vex a tool that people use directly. It is a table of records with columns of formulas, typed values, and error values that explain themselves.

## 2. What makes it different

| Excel, Google Sheets or Airtable | The Vex sheet app |
|---|---|
| A formula for each cell, copied down a column. A copy can go wrong. | One formula for each column. Vex evaluates it at each row. |
| Ranges like `B2:B40` | Axes: the other rows, the children, the neighbors, the rows where a test is true |
| A cell has a number, a text or a date | A column has a domain: numbers, vectors, colors, angles, or a domain of your code |
| `#REF!` with no reason | Each error value has a reason, a location and the steps that made it |
| A cycle stops the sheet | Each cell on a cycle gives `#CYCLE!`. The other cells stay correct. |
| Rows are flat | Rows can nest. A formula can sum the children or read the parent. |
| Formulas are text in cells | Formulas are data (the IR of Vex): diffs, links and tests |

## 3. The first version

- A table with rows and columns. A column is a value column or a formula column.
- Value columns of the kinds number, text, boolean, `Vec2` and color.
- A formula editor with highlighting, completion of the ops of the domain, and errors as you type.
- A cell inspector: the value, the error and its reason, and the steps of the evaluation.
- Tree rows: indent and outdent a row. Roll-ups with `children` and `descendants`.
- Sort and filter views. A view does not change the results of the formulas.
- Undo and redo, keyboard navigation, the light and the dark theme, and accessibility checks.
- Import and export of CSV. Save and load of JSON. A share link for a small sheet. Automatic save in the browser.

## 4. Later versions

- Grid sheets with A1 addresses (a grid space).
- More than one table, with references between tables.
- Collaboration in real time.
- Domains as plug-ins.
- A desktop app.

## 5. The architecture

- A new package in this monorepo, built with Vite and React. The site serves it at `/vex/app/`. It uses the tokens and the theme of the site.
- The engine is `root.sheet()` and the IR. The app adds no new semantics.
- The document is JSON: the tables, the columns, the rows and the formulas.
- The formula language is a new front end that gives the IR (§6). The builder and the Lab reader are the other front ends.
- A worker evaluates a large table, so the page stays fast.

## 6. The formula language

| Option | Example | For | Against |
|---|---|---|---|
| A. Vex chains, as in the Lab | `root.from("price")._.multiply("qty")` | No new language | Long, and strange for users of spreadsheets |
| B. A formula language like Excel, compiled to the IR | `= price * qty`, `= SUM(children.cost)`, `= RANK(score)` | Easy for users of spreadsheets | A new language with its own spec and tests |
| C. Option B, with a view of each formula as a Vex chain | Both | Easy, and it teaches Vex | The most work |

The recommendation is C. The IR stays the one semantics, so the differential tests of the plan to zero defects cover the new language too.

## 7. Quality

The app is also a use case of [the plan to zero defects](./QUALITY-PLAN.md). Its formula language gets a spec and differential tests. Its widgets get the browser, screenshot and keyboard tests. Each defect that the app finds in Vex gets a regression row.

## 8. Decisions of the owner

The owner made these decisions on 2026-10-11:

1. The place: a package in this monorepo. The site serves the app at `/vex/app/`.
2. The formula language: option C. A formula language like Excel compiles to the IR, and the app shows each formula as a Vex chain.
3. The model: a table of records first.
4. The scope of the first version: the full list of §3.

## 9. Decisions of the design

- A table is a tree space. A row without a parent is a root. A flat table has only roots.
- `row(-1)` is the move `offset(-1)`. In a tree space it goes to the previous sibling (spec `NAV.OFFSET.TREE`). Thus a running total works in a flat table and in each group.
- A value column is a field of the records. A formula column is a column of `root.sheet()`, so a cycle gives `#CYCLE!`.
- The formula language has its own spec, `spec/formula.md`, with requirement IDs and tests.
- A row has a name: the text of its first column, when that column is a text column. `row("name").` reads the row with that name (spec `FORMULA.NAV.NAME`). A name of no row, or of two rows, is an error. Thus a formula does not read a row that the author did not mean.
- The link `#example=<id>` opens an example. The gallery page of the spreadsheets uses it.
- The app reads the link in the address when it starts and each time the address changes. After an edit, the app removes the link from the address. Thus a reload opens the changed sheet, not the link.
- A cell of a formula column can have its own formula (spec `SHEET.CELL.FORMULA`). That formula replaces the formula of the column in that cell. The grid marks the cell, and the button **Own formula** adds or removes the formula. The first row of a recurrence is the usual case, so the column needs no `IFERROR`.
- A chart draws the columns that the user chooses, over the rows on the screen. A column of numbers gives a line, and a column of vectors gives a path. A chart of paths has one scale on the two axes, so a shape keeps its form.
- The chart is a part of the document. Thus undo, the share link and the JSON file keep it.
