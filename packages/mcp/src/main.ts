/**
 * The entry of the MCP server of Vex: the server on the standard input and output. The plugin of Vex for Claude Code
 * starts it.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.ts";

await createServer().connect(new StdioServerTransport());
