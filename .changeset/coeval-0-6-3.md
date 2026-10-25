---
"@mark1russell7/vex": patch
---

`@mark1russell7/vex` takes `@mark1russell7/coeval` ^0.6.3. Each top-level call of coeval 0.6.2 and later has a pure mark, so a bundle that does not use the standard library of coeval drops it (about 1.7 kB gzip). Vex uses no `perform` of coeval and no `HostThing`, so the two changed results of 0.6.3 do not change a result of Vex.
