---
"@mark1russell7/vex-compiler": patch
"@mark1russell7/vex-mcp": patch
---

A standalone module takes a graph space (COMPILE.MODULE.GRAPH). With the option `space: "graph"`, the run takes the edges after the variables: for each record, the positions of the ends of its edges. The axes `successors`, `predecessors` and `reachable` give the targets of the interpreter. A module also takes `reduce` with a literal op and the options `strict` and `domain` (COMPILE.MODULE.REDUCE). Thus the force pilot is a module with plain loops.

The tool `vex_module` takes the input `space: "graph"`.

The type of the option `space` of `ModuleOptions` is wider: `"array" | "tree" | "graph"`. The reason for a space that a module does not take changes from `the space "…" is not "array" or "tree"` to `the space "…" is not "array", "tree" or "graph"`. A program with `reduce` or a graph space gave a reason before, and at this time it gives a module.

The level is PATCH: the type of an option is wider, and no export changes its name. Before 1.0, a new feature is a PATCH.
