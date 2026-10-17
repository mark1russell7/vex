#!/usr/bin/env node
/**
 * The entry of the MCP server of Vex: the server on the standard input and output. The plugin of Vex for Claude Code
 * starts it, and the package gives it as the command `vex-mcp`.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import process from "node:process";
import { createServer } from "./server.ts";

// The server ends when its client closes the standard input, so no process stays after the client.
process.stdin.on("end", () => process.exit(0));
await createServer().connect(new StdioServerTransport());
