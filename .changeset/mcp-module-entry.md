---
"@mark1russell7/vex-mcp": patch
---

The entry `./module` gives the five tools of Vex to a procedures server that loads modules, for example the dev-tools server of `@procedures/mcp-dev-tools` through `MCP_BUNDLES`. Its default export is `vexModule`, `mcpNamespaces` is `["vex"]`, and `mcpInstructions` is the text of the instructions of the server. The export `INSTRUCTIONS` of `server.ts` holds that text. A test compares each tool in the two servers.
