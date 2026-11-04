---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-compiler": patch
---

A standalone module can hold a program over `Vec2` values (COMPILE.MODULE.FORM). A domain can give a `moduleForm`, the parts that a module copies in place of its own. In a module, a vector is plain `{ x, y }` data, the `toJSON` of a `Vec2`. The interpreter and `tiered` do not change.
