---
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-mcp": patch
---

`JsonDomain` has the op `leaves(o, depth)` (JSON.LEAVES). It gives the leaves of the object `o` as an array of records `{ path, kind, value }`, in the order of a walk. The walk goes into an object with fields while the path has fewer than `depth` keys. The paths join the keys with `.`. Thus the schema walk of Graph is one op, and the list ops read its result. The function reads no name outside itself, so a standalone module can copy it.

The catalog of `@mark1russell7/vex-mcp` has the row of `leaves`.

The level is PATCH, as the brief of the op asks. The new op adds a name to the domain, and no op of the domain changes.
