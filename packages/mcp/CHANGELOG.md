# @mark1russell7/vex-mcp

## 0.16.0

### Minor Changes

- a7d088b: The release train: the ranges of @procedures/client, @procedures/mcp-server change to a version outside the old range.

### Patch Changes

- be7202e: `JsonDomain` has the op `leaves(o, depth)` (JSON.LEAVES). It gives the leaves of the object `o` as an array of records `{ path, kind, value }`, in the order of a walk. The walk goes into an object with fields while the path has fewer than `depth` keys. The paths join the keys with `.`. Thus the schema walk of Graph is one op, and the list ops read its result. The function reads no name outside itself, so a standalone module can copy it.
  
  The catalog of `@mark1russell7/vex-mcp` has the row of `leaves`.
  
  The level is PATCH, as the brief of the op asks. The new op adds a name to the domain, and no op of the domain changes.
- 320b3f5: The list ops `distinct(list)`, `group(list, keys)` and `join(list, sep)` (LIST.DISTINCT, LIST.GROUP, LIST.JOIN), with the list chain methods `distinct()`, `group(keys)` and `join(sep)`. Tier 2 and a standalone module give a reason for them, so tier 1 evaluates them. The catalog of `vex-mcp` lists the three ops.
  
  Breaking: on a Vex list, a list op comes before a function of the host with its name. Thus a host function `distinct`, `group` or `join` no longer applies to a Vex list. Rename such a function. On an array, a function of the host or a domain op with the name still comes first.
- Updated dependencies [0e25e96]
- Updated dependencies [be7202e]
- Updated dependencies [320b3f5]
  - @mark1russell7/vex@0.15.0
  - @mark1russell7/vex-domains@0.15.0
  - @mark1russell7/vex-compiler@0.15.0

## 0.15.1

### Patch Changes

- d41464f: The catalog describes `as`: the names of the item and its index in a loop over a list.
- 6e06bd7: A JSON domain reads the kinds and fields of a JSON value (JSON.KIND, JSON.FIELD). `JsonDomain` has the ops `kind`, `kinds`, `fields` and `field`. Put it last in the list of domains. The catalog of the MCP server lists it.
- Updated dependencies [6a67959]
- Updated dependencies [d41464f]
- Updated dependencies [6e06bd7]
- Updated dependencies [82ecf84]
- Updated dependencies [f3bc451]
- Updated dependencies [c304087]
  - @mark1russell7/vex-compiler@0.14.0
  - @mark1russell7/vex@0.14.0
  - @mark1russell7/vex-domains@0.14.0

## 0.15.0

### Minor Changes

- 7339b7e: The release train: the ranges of @procedures/client, @procedures/mcp-server change to a version outside the old range.

### Patch Changes

- 535409b: `sortBy` has the option `by` (LIST.SORT.BY). `sortBy(list, { by: "from" })` sorts the items by the result of the op `from` on the value of each item. A standalone module has the option too (COMPILE.MODULE.SORT.BY). The catalog of the MCP server tells it.
- Updated dependencies [6b566b2]
- Updated dependencies [7fb316d]
- Updated dependencies [282f3fb]
- Updated dependencies [abe3624]
- Updated dependencies [1403f2b]
- Updated dependencies [535409b]
  - @mark1russell7/vex-compiler@0.13.4
  - @mark1russell7/vex@0.13.4
  - @mark1russell7/vex-domains@0.13.4

## 0.14.0

### Minor Changes

- df7b03a: The release train: the ranges of @procedures/client, @procedures/mcp-server change to a version outside the old range.

### Patch Changes

- 1fbfe81: A cell of a sheet module can hold a list (COMPILE.MODULE.SHEET.LIST). A later formula reads the list with the list ops, `get`, `indexOf`, the axis `list`, a `let` and the names of a loop. A column of lists that a formula reads before its own formula takes a `ListKind` in the option `kinds`, for example `{ list: "number" }`. The new type `ListKind` is an export.
  
  The value of a program in `emitModule` can be a list too, and `if` and `ifError` take lists as branches (COMPILE.MODULE.LIST.RESULT). The run gives each list as a `vex.list` with the keys as text, and an error item has the error `VEX_ERROR`. A program whose value is a list gave the reason "a list is a value of the program" before, and at this time it gives a module. Thus the tool `vex_module` gives a module for such a program.
  
  The level is PATCH: the change adds a feature and keeps each earlier result. Before 1.0, a backward-compatible feature is a PATCH. The option `kinds` takes more values, and the modules of the earlier programs do not change.
- Updated dependencies [1fbfe81]
- Updated dependencies [ba594b7]
  - @mark1russell7/vex-compiler@0.13.3
  - @mark1russell7/vex@0.13.3
  - @mark1russell7/vex-domains@0.13.3

## 0.13.2

### Patch Changes

- d1a3432: A standalone module takes a graph space (COMPILE.MODULE.GRAPH). With the option `space: "graph"`, the run takes the edges after the variables: for each record, the positions of the ends of its edges. The axes `successors`, `predecessors` and `reachable` give the targets of the interpreter. A module also takes `reduce` with a literal op and the options `strict` and `domain` (COMPILE.MODULE.REDUCE). Thus the force pilot is a module with plain loops.
  
  The tool `vex_module` takes the input `space: "graph"`.
  
  The type of the option `space` of `ModuleOptions` is wider: `"array" | "tree" | "graph"`. The reason for a space that a module does not take changes from `the space "…" is not "array" or "tree"` to `the space "…" is not "array", "tree" or "graph"`. A program with `reduce` or a graph space gave a reason before, and at this time it gives a module.
  
  The level is PATCH: the type of an option is wider, and no export changes its name. Before 1.0, a new feature is a PATCH.
- Updated dependencies [d1a3432]
- Updated dependencies [ea8bfb6]
- Updated dependencies [e63b1d7]
  - @mark1russell7/vex-compiler@0.13.2
  - @mark1russell7/vex@0.13.2
  - @mark1russell7/vex-domains@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies [caebf7d]
  - @mark1russell7/vex-compiler@0.13.1
  - @mark1russell7/vex@0.13.1
  - @mark1russell7/vex-domains@0.13.1

## 0.13.0

### Minor Changes

- d7eb247: The release train: the ranges of @procedures/client, @procedures/mcp-server change to a version outside the old range.

### Patch Changes

- Updated dependencies [e00a48f]
  - @mark1russell7/vex-compiler@0.13.0
  - @mark1russell7/vex@0.13.0
  - @mark1russell7/vex-domains@0.13.0

## 0.12.0

### Minor Changes

- ac4f97b: An array of a field or of a name is a list where a list op or the axis `list` needs a list (LIST.ARRAY). The key of each item is its position, from `"0"`. A position without a value, or with `null`, gives an error item of `#N/A`. Thus a layout reads a config array, for example `fr = [0.2, 0.3, 0.5]`, with `count`, `nth`, `take` and `list(...)`, and it needs no host functions for it.
  
  - `indexOf(list, value)` gives the position of the first item with the value, from 0, as `nth` counts (LIST.INDEXOF). The value is a number, a text or a boolean. A value that no item has gives `#N/A`.
  - `fill(n, value)` gives a list of `n` items with the value, and the positions as keys (LIST.FILL). `n` is a whole number from 0 to 100000.
  
  For an array, a domain or a function of the host with the op comes first. A program that gave `#VALUE!` for an array can give a value. For a list of Vex, the new ops come before a function of the host with the name `indexOf` or `fill`. Such a program can give a different value.
  
  Tier 2 gives a reason for `indexOf` and `fill`. A list op of tier 2 on an array goes to tier 1 at run time, so the tiers give the same result (P17). A standalone module gives a reason for these programs. The random programs of `@mark1russell7/vex-testkit` use the two new ops, and the catalog of `@mark1russell7/vex-mcp` has their rows.
  
  The level is MINOR. The new ops can change the result of a program with a function of the host named `indexOf` or `fill`. Before 1.0, such a change raises MINOR, as the list ops of block 1 did.
- 9206f84: The release train: the ranges of @procedures/client, @procedures/mcp-server change to a version outside the old range.

### Patch Changes

- Updated dependencies [ac4f97b]
- Updated dependencies [f6c55b3]
  - @mark1russell7/vex@0.12.0
  - @mark1russell7/vex-compiler@0.12.0
  - @mark1russell7/vex-domains@0.12.0

## 0.11.2

### Patch Changes

- 13b5f9b: A standalone module takes a tree space, the first part of design D of the study of recursion (COMPILE.MODULE.TREE). With the option `space: "tree"` of `emitModule`, the run takes the parents after the variables. Each entry is the position of the parent of its record, or -1 for a root. A parent that is not -1 or a position, or a cycle of parents, throws a `VexContractError`.
  
  The module has the move `parent` and the offsets among the siblings. It also has the window and the axes of a tree and of a graph, in both orders. The run makes only the parts of the tree that the program reads. The tool `vex_module` takes the input `space`.
  
  The type `ModuleOptions` gets the optional field `space`. Without it, a module is for an array space, and its text does not change. No caller needs a change, so the change is a patch before 1.0.
- Updated dependencies [5501948]
- Updated dependencies [5501948]
- Updated dependencies [2cb5c71]
- Updated dependencies [13b5f9b]
  - @mark1russell7/vex-compiler@0.11.2
  - @mark1russell7/vex@0.11.2
  - @mark1russell7/vex-domains@0.11.2

## 0.11.1

### Patch Changes

- Updated dependencies [dd4d5cb]
  - @mark1russell7/vex-compiler@0.11.1
  - @mark1russell7/vex@0.11.1
  - @mark1russell7/vex-domains@0.11.1

## 0.11.0

### Minor Changes

- 0d6edf5: `@mark1russell7/vex-mcp` takes `@procedures/client` and `@procedures/mcp-server` `^0.27.2`, not `^0.14.1`. It also takes `@mark1russell7/service` `^0.5.8`, not `^0.5.5`, because the new client needs it. The five tools keep their names, their inputs and their hints. Each tool stays read-only and idempotent. The command `vex-mcp` still stops with the code 0 at the end of its input.
  
  MINOR: before 1.0.0, a break of the public API raises MINOR. `vexModule` and `createHost` give the types of these packages, and those types changed from 0.14 to 0.27.
  
  The changes for a caller of `createHost(faces)`:
  
  - The face `http` has no listener of its own (`@procedures/mcp-server` 0.17.0). Its options `port`, `host` and `server` are removed.
  - To serve the face `http`, mount `host.handleHttp` on a listener. Then declare the listener and the host on a service.
  - The `token` of the face `http` is the token of the policy (0.27.0). The server of the host admits each HTTP request one time.
  - The faces `stdio` and `sdk` do not change. The default face is the standard input and output, as before.

### Patch Changes

- 9918bfb: Lists as the state of a loop, the second block of design E of the study of recursion. A name of `iterate` or `fold` can hold a list, and a step gives the next list from the old one (LOOP.LIST). `get(list, key)` gives the value of the first item with the key, and a key that no item has gives `#N/A` (LIST.GET). A literal can be a list, so the empty list and a list with one key start a stack or a seen set (LIST.LITERAL). Thus a force layout keeps all positions in one name, and each step reads the old positions by key.
  
  In the builder, a name of a loop whose first value is a list chain is a list chain in each step. A list chain as the result gives a list chain. `root.list(items)` makes a list literal, and a list chain has `get(key)` (BUILD.LIST.LOOP). The type `ListOp` has one more name, so a `switch` over it needs one more case. The types `LoopVars` and `LoopStep` change for names that hold lists.
  
  `isVexList` checks each item: a text key, and a value or an error value (LIST.SHAPE). Another value of the kind `vex.list` is a record, so no list op applies to it, and both tiers give `#VALUE!`. Before, a list op threw on such a value.
  
  Tier 2 and a module give a reason for these programs, and tier 1 evaluates them. The reference interpreter and the random programs of the test kit have them. The catalog of the MCP server lists `get` and the list literals.
- Updated dependencies [52c1e27]
- Updated dependencies [9918bfb]
  - @mark1russell7/vex@0.11.0
  - @mark1russell7/vex-compiler@0.11.0
  - @mark1russell7/vex-domains@0.11.0

## 0.10.0

### Patch Changes

- 59ef80d: coeval is the core of Vex (decision D13 of coeval, and decision D13 in `docs/REVIEW.md`). `@mark1russell7/coeval` ^0.6.0 is the one runtime dependency of `@mark1russell7/vex`, and the build does not copy it.
  
  - `VEX_WORLD` gives the contract of each kind of a document as data. The static kit of the kernel checks each document by it before `fromDocument` reads it (DOC.CHECK). The check uses `vexChecker`, a machine without the code of the evaluators, so a bundle that only reads documents does not hold them. A document that is not valid still gives `#VALUE!` with a JSON Pointer to the bad part, with the reason of the kernel. A computed key or position of a move can be a bare literal (DOC.MOVE).
  - `deps` finds the reads with the static kit of the kernel (`refsOf`). Its results do not change.
  - The kernel is the reference tier (EVAL.REFERENCE). `kernelPlan` gives the plan of a program in the kernel with `vexMachine`. The plan has `run`, `evaluate`, `reference` and `agree`. `reference` reads the document with the reference interpreter of the kernel, which compiles nothing. `agree` compares the tiers of the kernel with a tier that you give (EVAL.AGREE). `vexDefinitions` gives the definitions of the formula kit for the reference interpreter.
  - `referenceEvaluate` of the test kit uses the reference interpreter of the kernel. It takes a document too, and the options `vars` and `extensions`. The test kit has `arbChangedDocument`, `arbNumberExpr` and `arbNumberSpace`. The properties P19 to P22 compare the tiers with the kernel, and P17 compares the compiler with it too.
  - `toDocument` writes an expression of any depth.
  - `@mark1russell7/vex`, `@mark1russell7/vex-domains` and `@mark1russell7/vex-testkit` declare `"sideEffects": false`. No module of them has an effect at its import, so a bundler removes each module that a program does not use. The top level of the kernel has the annotation `__PURE__` too.
  - The MCP server ends the reason of a program that is not valid with one period, also when the reason of the kernel has its own period.
  - V-056: a program that is not an object, for example `0`, made `evaluate`, `explain` and a sheet with a compiler throw a `TypeError`. It gives `#VALUE!`.
  
  The API only grows, no export changes its type, and a document that is not valid still gives `#VALUE!`. Thus the level is patch (SemVer before 1.0).
- 394465d: List ops that build lists, the first block of design E of the study of recursion. `drop(list, n)` gives the items after the first `n` items (LIST.DROP). `append(list, other)` gives the items of two lists (LIST.APPEND). `without(list, other)` removes the items with a key of `other` (LIST.WITHOUT). `flat(list)` joins the lists that are the values of the items (LIST.FLAT). Each item keeps its key and its value, and LIST.LENIENT applies to each list that an op reads (LIST.BUILD). Thus a search can keep its stack in a list.
  
  A list chain of the builder has `drop(n)`, `append(other)`, `without(other)` and `flat()`, and the body of an axis can give a list chain (BUILD.LIST.BUILD). The type `ListOp` has four more names, so a `switch` over it needs four more cases.
  
  Tier 2 and a module give a reason for the four ops, and tier 1 evaluates the program. The reference interpreter and the random programs of the test kit have the four ops. The catalog of the MCP server lists them.
- Updated dependencies [59ef80d]
- Updated dependencies [394465d]
  - @mark1russell7/vex@0.10.0
  - @mark1russell7/vex-domains@0.10.0
  - @mark1russell7/vex-compiler@0.10.0

## 0.9.1

### Patch Changes

- 53ab73f: A program can be a document of coeval, the language base of the family (decision D12 of coeval). `toDocument` gives the document of an expression, `fromDocument` reads a document back, and `isDocument` tells a document from the tagged IR. Each term is an envelope `{ type, value }`, and a reference is a path from `self` or from `names` (spec §4.1, `DOC.*`).
  
  `compile`, `evaluate`, `explain` and `parse` take a document as well as an expression. `tiered`, `generate` and `emitModule` of the compiler and the tools of `vex-mcp` take a document too. The results for the tagged IR do not change. A document that is not valid gives `#VALUE!` with its reason and its location. The helpers of `@mark1russell7/coeval` are in the build, so `@mark1russell7/vex` has no runtime dependency.
- Updated dependencies [53ab73f]
  - @mark1russell7/vex@0.9.1
  - @mark1russell7/vex-compiler@0.9.1
  - @mark1russell7/vex-domains@0.9.1

## 0.9.0

### Minor Changes

- e91fb9f: The MCP server of Vex uses the host of the procedure servers of the family. Each tool is a procedure of `@procedures/client` in the module `vex` (`vexModule`), and `createHost` serves it with `createMcpHost` of `@procedures/mcp-server`. The names and the inputs of the five tools do not change. Each tool tells the client that it is read-only and idempotent. The export `createServer` is removed: use `createHost`. The package does not depend on `@modelcontextprotocol/sdk` at run time.
  
  The command `vex-mcp` gives the host to `run()` of `@mark1russell7/service`. The end of the standard input, SIGINT and SIGTERM stop the host in stages, and then the process exits.

### Patch Changes

- @mark1russell7/vex-compiler@0.9.0
  - @mark1russell7/vex@0.9.0
  - @mark1russell7/vex-domains@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [9bad010]
- Updated dependencies [c22cb83]
- Updated dependencies [d654627]
  - @mark1russell7/vex-compiler@0.8.1
  - @mark1russell7/vex@0.8.1
  - @mark1russell7/vex-domains@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [431bea0]
- Updated dependencies [f85789c]
- Updated dependencies [1520434]
  - @mark1russell7/vex@0.8.0
  - @mark1russell7/vex-compiler@0.8.0
  - @mark1russell7/vex-domains@0.8.0

## 0.7.0

### Minor Changes

- 7aa1dde: The new package `@mark1russell7/vex-mcp` is the MCP server of Vex. Its tools give the catalog of the domains (`vex_catalog`), and they check (`vex_check`), evaluate (`vex_evaluate`), explain (`vex_explain`) and compile (`vex_module`) a program as JSON. The command `vex-mcp` starts the server on the standard input and output. The plugin of Vex for Claude Code starts it.

### Patch Changes

- Updated dependencies [f55e076]
- Updated dependencies [344f306]
- Updated dependencies [6a9728e]
- Updated dependencies [e6a565f]
- Updated dependencies [c0fda11]
- Updated dependencies [7c2d0c3]
- Updated dependencies [a87c033]
- Updated dependencies [da04054]
- Updated dependencies [9987fb6]
- Updated dependencies [d376e73]
- Updated dependencies [990a858]
- Updated dependencies [159c1ab]
- Updated dependencies [159c1ab]
- Updated dependencies [124a3d4]
- Updated dependencies [2383c3b]
  - @mark1russell7/vex-compiler@0.7.0
  - @mark1russell7/vex@0.7.0
  - @mark1russell7/vex-domains@0.7.0
