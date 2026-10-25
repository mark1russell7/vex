---
"@mark1russell7/vex-compiler": patch
---

V-057: the check of an inline form took exponential time for some sources of domain ops. A text of many `!==` and then a quote, for example `(a) => a + "x!==!==!=="` with 40 `!==`, kept `emitModule` busy for hours (CodeQL `js/redos`). A tokenizer takes one token at each step, so the time is linear in the length of the source.

V-058: the old check took `<<=`, `>>=` and `>>>=` as two tokens. So the inline form of `(a) => (a <<= 1)` wrote the field of the record, and the module gave other values than the interpreter. The module keeps the function of such an op, as it does for an op with `+=`.

PATCH: these are fixes, and the API does not change.
