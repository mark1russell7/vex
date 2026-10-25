---
"@mark1russell7/vex-domains": patch
---

`Vec2Domain` has four ops for a main axis and a cross axis (VEC2.ALONG, VEC2.COMPOSE and VEC2.SELECT). Thus one program serves the two directions of a stack, a span or a row of keys and values.

- `along(v, dir)` gives `dot(v, dir)`, the component along the unit axis `dir`.
- `across(v, dir)` gives `dot(v, swap(dir))`, the component on the other axis.
- `compose(dir, main, cross)` gives `dir * main + swap(dir) * cross`.
- `select(mask, a, b)` gives the component of `a` where the mask is not 0, else the component of `b`. A number argument lifts to a vector.

A component of a `Vec2` stays finite (VEC2.FINITE), so each result of a program before this change stays the same. An open bound uses `select` with `max` or `min`, not an infinite bound.

The level is PATCH: the ops are new, and no op or type changes. Before 1.0, a new feature is a PATCH.
