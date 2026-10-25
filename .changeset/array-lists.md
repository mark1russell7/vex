---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-mcp": patch
---

An array of a field or of a name is a list where a list op or the axis `list` needs a list (LIST.ARRAY). The key of each item is its position, from `"0"`. A position without a value, or with `null`, gives an error item of `#N/A`. Thus a layout reads a config array, for example `fr = [0.2, 0.3, 0.5]`, with `count`, `nth`, `take` and `list(...)`, and it needs no host functions for it.

- `indexOf(list, value)` gives the position of the first item with the value, from 0, as `nth` counts (LIST.INDEXOF). The value is a number, a text or a boolean. A value that no item has gives `#N/A`.
- `fill(n, value)` gives a list of `n` items with the value, and the positions as keys (LIST.FILL). `n` is a whole number from 0 to 100000.

A domain or a function of the host with the op comes first. Thus each program that gave a value before gives the same value. A program that gave `#VALUE!` for an array can give a value.

Tier 2 gives a reason for `indexOf` and `fill`. A list op of tier 2 on an array goes to tier 1 at run time, so the tiers give the same result (P17). A standalone module gives a reason for these programs. The random programs of `@mark1russell7/vex-testkit` use the two new ops, and the catalog of `@mark1russell7/vex-mcp` has their rows.

The level is PATCH: the ops are new, and each result of before stays. Before 1.0, a new feature is a PATCH.
