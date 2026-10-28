---
"@mark1russell7/vex": minor
"@mark1russell7/vex-mcp": patch
---

The list ops `distinct(list)`, `group(list, keys)` and `join(list, sep)` (LIST.DISTINCT, LIST.GROUP, LIST.JOIN), with the list chain methods `distinct()`, `group(keys)` and `join(sep)`. Tier 2 and a standalone module give a reason for them, so tier 1 evaluates them. The catalog of `vex-mcp` lists the three ops.

Breaking: on a Vex list, a list op comes before a function of the host with its name. Thus a host function `distinct`, `group` or `join` no longer applies to a Vex list. Rename such a function. On an array, a function of the host or a domain op with the name still comes first.
