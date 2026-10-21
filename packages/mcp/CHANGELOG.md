# @mark1russell7/vex-mcp

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
