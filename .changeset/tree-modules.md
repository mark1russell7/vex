---
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

A standalone module takes a tree space, the first part of design D of the study of recursion (COMPILE.MODULE.TREE). With the option `space: "tree"` of `emitModule`, the run takes the parents after the variables. Each entry is the position of the parent of its record, or -1 for a root. A parent that is not -1 or a position, or a cycle of parents, throws a `VexContractError`.

The module has the move `parent` and the offsets among the siblings. It also has the window and the axes of a tree and of a graph, in both orders. The run makes only the parts of the tree that the program reads. The tool `vex_module` takes the input `space`.

The type `ModuleOptions` gets the optional field `space`. Without it, a module is for an array space, and its text does not change. No caller needs a change, so the change is a patch before 1.0.
