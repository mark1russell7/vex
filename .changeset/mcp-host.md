---
"@mark1russell7/vex-mcp": minor
---

The MCP server of Vex uses the host of the procedure servers of the family. Each tool is a procedure of `@procedures/client` in the module `vex` (`vexModule`), and `createHost` serves it with `createMcpHost` of `@procedures/mcp-server`. The names and the inputs of the five tools do not change. Each tool tells the client that it is read-only and idempotent. The export `createServer` is removed: use `createHost`. The package does not depend on `@modelcontextprotocol/sdk` at run time.

The command `vex-mcp` gives the host to `run()` of `@mark1russell7/service`. The end of the standard input, SIGINT and SIGTERM stop the host in stages, and then the process exits.
