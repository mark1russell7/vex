---
"@mark1russell7/vex": patch
"@mark1russell7/vex-domains": patch
"@mark1russell7/vex-testkit": minor
---

Fix V-044: a domain value with `toJSON`, for example a `Vec2`, now round-trips through `serialize` and `parse`. Before, `serialize` wrote the `toJSON` form, and `parse` gave a plain object. The test kit adds the builder model test (`arbChain`, `runChain`, `modelChain`), and `referenceEvaluate` takes the free functions (`fns`).
