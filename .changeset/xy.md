---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": patch
---

Vectors as plain data, for a standalone module. `XYDomain` has the component-wise ops of `Vec2Domain` for `{ x, y }` objects, and each op is a function, so `emitModule` can copy the domain. The op `xy` of `NumDomain` makes a value of it. An op can declare a result of another domain with `returns: "domain:Name"` (KIND.RETURNS): the compiler knows the kind of the result, and the law checker of the test kit checks such a result when its new option `domains` has that domain.
