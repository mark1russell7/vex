---
"@mark1russell7/vex": patch
---

`@mark1russell7/vex` takes `@mark1russell7/coeval` ^0.6.3. From 0.6.2, each top-level call of coeval has a pure mark. Thus a bundle without the standard library of coeval is 1.7 kB gzip smaller. Vex uses no `perform` of coeval and no `HostThing`. Thus the two changed results of 0.6.3 do not change a result of Vex.
