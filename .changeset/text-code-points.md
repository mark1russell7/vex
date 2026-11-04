---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

`TextDomain` has the op `codePoints`: the code points of a text as a list of numbers, in each tier (TEXT.CODEPOINTS). The new kind `list:number` of `returns` declares an op of a domain with a list as its result (KIND.RETURNS.LIST). A module takes that op as a list (COMPILE.MODULE.LIST.OP).
