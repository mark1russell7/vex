---
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-mcp": minor
---

The new entry `@mark1russell7/vex-domains/quantity` gives `QuantityDomain`: amounts in units as plain data, `{ value, unit }`. The package `@mark1russell7/quantity` does the unit arithmetic, and it converts each amount exactly. Thus `lte` of 155 mm and 16 cm is `true`. Two amounts of different kinds give `#CALC!` with the reason. The main entry does not change.

The MCP tools accept the name `QuantityDomain` in their list of domains, and the catalog has the domain. The default domains do not change.
