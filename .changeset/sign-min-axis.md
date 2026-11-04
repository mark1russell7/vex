---
"@mark1russell7/vex-domains": minor
---

`NumDomain` has the op `sign` (NUM.SIGN). `Vec2Domain` and `XYDomain` have the ops `sign` and `minAxis` (VEC2.SIGN, VEC2.MINAXIS and XY.SIGN). A force separation uses them for a push along the smallest axis, with the sign of the gap.

- `sign` gives the value of `Math.sign`, on each component of a vector. `NaN` gives `#NUM!`, and an infinite value gives 1 or -1.
- `minAxis(v)` gives (1, 0) if `x <= y`, else (0, 1). It compares signed values, a tie gives (1, 0), and a component `NaN` gives `#NUM!`.

The ops of `XYDomain` are functions, so a standalone module can copy them. The ops of `Vec2Domain` are in tier 2, and the class stays out of a module.

The level is MINOR: before 1.0, a breaking change raises MINOR, and an unclear case counts as breaking. The op of a domain comes before a function of the host. Thus a host function `sign` on a number gives way to the op of `NumDomain`. A host function `sign` or `minAxis` on a vector gives way in the same manner.
