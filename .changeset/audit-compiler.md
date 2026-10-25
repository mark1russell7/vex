---
"@mark1russell7/vex-compiler": patch
---

Four fixes of the compiler:

- A static site of tier 2 whose op gives a value of a domain stays in tier 2 (V-059). An example is the op `xy` of `NumDomain`. Before, each run of such a program went to tier 1.
- `emitModule` gives a reason when the option `name` is a reserved word, a global of JavaScript or a name of the module (V-060). Before, such a name gave a module that did not parse, or a run that read its own function in place of a global.
- The check of a result of a domain has a JavaScript name for each name of the domain (V-061). Before, a name with a space, a dot or a parenthesis gave a module that did not parse.
- Tier 2 and a standalone module keep a field of a record with the name `__proto__` (V-062).

The changes are fixes, and the API does not change, so the change is a patch.
