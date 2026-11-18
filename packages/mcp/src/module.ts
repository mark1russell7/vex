/**
 * The module entry of the tools of Vex. A procedures server that loads modules serves the five tools in its own
 * process, with no second MCP server. The dev-tools server of `@procedures/mcp-dev-tools` loads this entry when
 * `MCP_BUNDLES` names it. An import of this entry registers nothing and starts nothing.
 */
export { vexModule as default, INSTRUCTIONS as mcpInstructions } from "./server.ts";

/** The namespaces of the tools of the module: a server exposes the procedures of these namespaces as tools. */
export const mcpNamespaces: readonly string[] = ["vex"];
