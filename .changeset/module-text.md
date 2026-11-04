---
"@mark1russell7/vex-compiler": minor
"@mark1russell7/vex-mcp": patch
"@mark1russell7/vex-testkit": patch
---

The bytes of a module do not depend on the runner (COMPILE.MODULE.TEXT). The compiler parses the text of each copied function and prints the tree. Breaking: `emitModule`, `emitSheetModule` and their types move from the root entry to `@mark1russell7/vex-compiler/module`, so a program that only runs tiers does not load the parser.
