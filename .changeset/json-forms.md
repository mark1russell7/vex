---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
---

The JSON form of a literal keeps every value. A record with the key `$vex` gets an escape form (V-045, spec IR.JSON.ESCAPE), and `-0`, `NaN` and the infinities get a number form (V-046, spec IR.JSON.NUMBER). A domain value can be in a list or a record of a literal. A file from an older version reads as before.
