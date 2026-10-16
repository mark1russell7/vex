---
"@mark1russell7/vex": minor
"@mark1russell7/vex-compiler": minor
---

Kinds of domains (KIND.DOMAIN): a value of a domain without a primitive type has the kind `domain:Name`. An op with `returns: "domain"` gives this kind, a schema can declare it for a field, and a site on such a value is static. Thus a standalone module can hold the values of a kernel: a domain of plain data, for example a structure that a fold builds. A domain declares `samples`, and a module checks each copy of an op with them. A module checks a field of such a kind with a copy of `is` of the domain.
