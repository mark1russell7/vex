---
"@mark1russell7/vex-domains": minor
"@vex/formula": minor
"@vex/sheet-app": minor
---

`DateDomain` and `LocalDate`: a day of the calendar, without a time and without a time zone. A date plus some days is a date, and a date minus a date is a count of days. The ops are `add`, `subtract`, `addMonths`, `endOfMonth`, `year`, `month`, `day`, `weekday` and the comparisons. The op `date` of `NumDomain` makes a date from a year, a month and a day, and a month or a day outside its range rolls over.

The formula language has `DATE`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `EDATE` and `EOMONTH` (spec FORMULA.DATE). The sheet app has date columns, a CSV import finds them, and a chart can use a column of dates for its horizontal axis. The new example is a list of invoices.
