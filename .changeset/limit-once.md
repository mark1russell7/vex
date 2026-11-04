---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": patch
"@mark1russell7/vex-compiler": patch
---

A module counts a data limit that reads no key one time for each run. Thus a walk that stops early does not pay for a count at each key. The values and the errors do not change (COMPILE.MODULE.LIMIT.ONCE).
