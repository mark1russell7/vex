---
"@mark1russell7/vex-compiler": patch
---

A list op of a module is faster again. In 0.17.1, `V` kept the cache of `VW` on each new list, and the list ops became slower. `V` scans the list and gives it without a copy and without a cache. The values do not change.
