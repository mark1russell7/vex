---
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex": patch
"@mark1russell7/vex-mcp": patch
---

`epochMillis` of `TextDomain` reads a `t` and a `z` in lower case, as RFC 3339 §5.6 permits. `ISO_TIME` of the entry `@mark1russell7/vex/query` reads the same forms, so the catalog of the fields agrees with the op. The catalog of the tools tells that `epochMillis` cuts a fraction to milliseconds and does not round it.
