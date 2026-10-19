#!/usr/bin/env node
/**
 * The entry of the MCP server of Vex: the host on the standard input and output. The plugin of Vex for Claude Code
 * starts it, and the package gives it as the command `vex-mcp`.
 */
import process from "node:process";
import { createHost } from "./server.ts";

// The host stops when its client closes the standard input, so no process stays after the client.
const host = createHost();
await host.start();
await host.closed;
process.exit(0);
