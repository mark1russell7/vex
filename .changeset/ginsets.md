---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": minor
---

`InsetsDomain` keeps the four sides of an inset as plain data, and the op `insets` of `NumDomain` makes a value. A number lifts to four sides, also in a module. A domain can declare `fields`, so two domains of plain objects can share a module.

The new op `insets` of `NumDomain` comes before a host function of that name, so `vex-domains` raises MINOR before 1.0.0. The default list of `vex-mcp` has the new domain, so a record with exactly the four sides goes to it before `NumRecordDomain`. An unclear change counts as breaking, so `vex-mcp` raises MINOR too.
