---
"@mark1russell7/vex": minor
"@mark1russell7/vex-domains": minor
"@mark1russell7/vex-testkit": minor
---

An empty `reduce` gives the identity of the op only when exactly one domain has an identity for it. When more domains have one, the result is `#N/A` with their names, and the new option `reduce(op, { domain })` names the domain to use (V-049, spec LIST.REDUCE.EMPTY). Before, an empty sum of vectors could be the number 0.
