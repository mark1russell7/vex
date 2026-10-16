---
"@mark1russell7/vex-domains": minor
---

The vectors have ops to make them and to read them. The op `vec2` of `NumDomain` makes a `Vec2` from two numbers: `vec2(x, y)`. The ops `x` and `y` of `Vec2Domain` give the components. `NDVectorDomain` has the component-wise ops `min` and `max`. Thus one expression can calculate a size or a position in two dimensions.
