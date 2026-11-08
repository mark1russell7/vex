---
"@mark1russell7/vex-compiler": patch
---

Each regular expression of the passes that tidy a module is a function in the compiler. The texts of the helpers of a module come from five functions, so the mutation lane can cut them into parts. The text of the module does not change.
