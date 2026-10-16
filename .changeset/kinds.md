---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
---

The kinds (KIND.PRIMITIVE, KIND.RETURNS, KIND.STATIC). A domain can declare `primitive`, the JavaScript type of its values, and an op can declare `returns`, the kind of its result. The scalar domains declare both, and the law checker of the test kit checks both. `generate` and `tiered` take a `schema` with the kinds of the fields and the variables. An op site whose values have known kinds calls its op with no guard, and a value against the schema goes to tier 1.
