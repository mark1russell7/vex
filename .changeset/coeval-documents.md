---
"@mark1russell7/vex": patch
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

A program can be a document of coeval, the language base of the family (decision D12 of coeval). `toDocument` gives the document of an expression, `fromDocument` reads a document back, and `isDocument` tells a document from the tagged IR. Each term is an envelope `{ type, value }`, and a reference is a path from `self` or from `names` (spec §4.1, `DOC.*`).

`compile`, `evaluate`, `explain` and `parse` take a document as well as an expression. `tiered`, `generate` and `emitModule` of the compiler and the tools of `vex-mcp` take a document too. The results for the tagged IR do not change. A document that is not valid gives `#VALUE!` with its reason and its location. The helpers of `@mark1russell7/coeval` are in the build, so `@mark1russell7/vex` has no runtime dependency.
