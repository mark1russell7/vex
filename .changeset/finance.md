---
"@mark1russell7/vex-domains": minor
"@vex/formula": minor
---

`NumDomain` has the ops `ln`, `exp` and `log10`. A result that is not finite, for example `ln(0)`, gives `#NUM!`.

The formula language has the finance functions `PMT`, `FV`, `PV` and `NPER` of a spreadsheet, with its signs (spec FORMULA.FINANCE). Each function compiles to arithmetic, so the steps of a cell show the calculation. The tests compare each function with the examples of the documentation of Excel.
