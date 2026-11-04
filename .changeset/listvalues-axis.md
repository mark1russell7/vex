---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
---

The generated code of `@mark1russell7/vex-compiler` takes `each` and `fold` over the axis `list`, also with `reverse`, `where`, an address and `as` (COMPILE.LIST.AXIS). Tier 1 still evaluates that axis over a list with an error item. The core exports `asList`, the list of a value (LIST.ARRAY). The rule is PATCH before 1.0.0: this is a new feature that keeps each result.
