---
"@mark1russell7/vex-compiler": patch
---

A list op on an array in the body of a list op over an axis goes to tier 1 (V-064). Before, the runtime of tier 2 took such a list op as an error item. So `count(each(all, sum(let(b = [], []))))` gave 0 in tier 2, and the interpreter gave the count of the records. The two tiers give the same result again.

The level is PATCH: a bug fix, with no change to an export.
