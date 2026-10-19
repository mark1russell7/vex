#!/usr/bin/env node
/**
 * The entry of the MCP server of Vex: the host on the standard input and output. The plugin of Vex for Claude Code
 * starts it, and the package gives it as the command `vex-mcp`.
 */
import { ephemeral, service } from "@mark1russell7/service";
import { createHost } from "./server.ts";

// The runner of the service owns the host. The end of the standard input, SIGINT and SIGTERM stop it in stages, and
// then the process exits. Thus no process stays after its client.
await createHost().declare(service("vex-mcp").profile(ephemeral)).run();
