---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-mcp": patch
---

The list op `includes(list, value)` (LIST.INCLUDES) gives `true` when an item equals the value by the op `eq` of the domain of the value. It is in the interpreter, the reference tier and tier 2. A standalone module gives a reason for it. The op `epochMillis` of `TextDomain` (TEXT.EPOCHMILLIS) reads an ISO 8601 time with `Z` or an offset and gives the milliseconds since 1970. Thus the ops of numbers compare two times. It is in each tier and in a module. The catalog of `vex-mcp` lists the two ops, and the row of `ifError` tells how to give a default for a missing field.

Breaking: on a Vex list, the list op `includes` comes before a function of the host with the same name.
