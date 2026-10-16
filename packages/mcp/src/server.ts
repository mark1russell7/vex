/**
 * The MCP server of Vex. Its tools give the catalog of the domains, and they check, evaluate, explain and compile a
 * program as JSON. An agent can test a program with them before it writes the program into the code of a project.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Schema } from "@mark1russell7/vex-compiler";
import { z } from "zod";
import { catalogText, CATALOG, domainText } from "./catalog.ts";
import { check, evaluateAll, explainAt, moduleOf, ToolError } from "./tools.ts";

const program = z.unknown().describe('The program as the JSON form of the IR, for example {"tag":"app","op":"add","args":[{"tag":"ref","path":["n"]},{"tag":"lit","value":1}]}');
const domains = z.array(z.string()).optional().describe("The domains of the program, in order, by name (for example NumDomain or Vec2). The default is each standard domain.");
const spaceInput = z
  .object({
    kind: z.enum(["array", "record", "grid", "tree", "graph"]),
    records: z.unknown().describe('A list of records (array), an object of records by key (record, tree, graph), or a list of rows (grid). A value of a domain is {"$vex":"domain","domain":"Vec2","value":[1,2]}.'),
    parents: z.record(z.string(), z.string().nullable()).optional().describe("For a tree: the parent of each key, or null for a root"),
    edges: z.record(z.string(), z.array(z.string())).optional().describe("For a graph: the keys that each key points to"),
  })
  .describe("The space: the records and their keys");
const vars = z.record(z.string(), z.unknown()).optional().describe("The values of the variables of the run");

/** This function gives the result of a tool as JSON text, or the message of a ToolError as an error of the tool. */
function run(f: () => unknown): CallToolResult {
  try {
    const value = f();
    return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
  } catch (thrown) {
    if (!(thrown instanceof ToolError)) throw thrown;
    return { isError: true, content: [{ type: "text", text: thrown.message }] };
  }
}

/** This function makes the server with its tools. The caller connects it to a transport. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "vex", version: "0.1.0" });
  server.registerTool(
    "vex_catalog",
    {
      title: "The catalog of the domains of Vex",
      description: "Gives each domain of @mark1russell7/vex-domains and each op: its call, its result, its lifting, its laws and its identity. Read it before a program uses an op, and before you write a host function for math.",
      inputSchema: { domain: z.string().optional().describe("One domain by its import name, for example Vec2Domain. Without it, the tool gives the whole catalog.") },
    },
    ({ domain }) =>
      run(() => {
        if (domain === undefined) return catalogText();
        const entry = CATALOG.find((x) => x.name === domain || x.d.name === domain);
        if (entry === undefined) throw new ToolError(`no domain of the catalog has the name "${domain}". The names are ${CATALOG.map((x) => x.name).join(", ")}`);
        return domainText(entry);
      }),
  );
  server.registerTool(
    "vex_check",
    {
      title: "Check a Vex program",
      description: "Checks a program as JSON. Gives its number of nodes, its nesting, the fields that it reads, and if the compiler gives it generated code. A program that is not valid gives the reason.",
      inputSchema: { program, domains },
    },
    (input) => run(() => check(input)),
  );
  server.registerTool(
    "vex_evaluate",
    {
      title: "Evaluate a Vex program",
      description: "Evaluates a program at each key of a space of records, or at each key of origins. Gives the value at each key, or the error with its code, kind, message and the path of its node.",
      inputSchema: { program, space: spaceInput, origins: z.array(z.string()).optional().describe("The keys to evaluate at. The default is each key."), domains, vars },
    },
    (input) => run(() => evaluateAll(input)),
  );
  server.registerTool(
    "vex_explain",
    {
      title: "Explain a Vex program at one key",
      description: "Gives the trace of a program at one key: each node, with its focus, its reads and its result. Use it to find where an error starts.",
      inputSchema: { program, space: spaceInput, origin: z.string().describe("The key to evaluate at"), domains, vars },
    },
    (input) => run(() => explainAt(input)),
  );
  server.registerTool(
    "vex_module",
    {
      title: "Compile a Vex program into a standalone module",
      description: "Gives the source of a standalone ES module of a program, without Vex at run time, or the reason that the program cannot be one. The schema gives the kind of each field and variable.",
      inputSchema: {
        program,
        domains,
        schema: z
          .object({ fields: z.record(z.string(), z.string()).optional(), vars: z.record(z.string(), z.string()).optional() })
          .describe('The kind of each field and variable: number, string, boolean, or domain:Name, for example {"fields":{"w":"number"}}'),
        name: z.string().optional().describe("The name of the exported function. The default is run."),
      },
    },
    // The kinds of the schema are texts here, and the compiler checks each kind.
    (input) => run(() => moduleOf({ ...input, schema: input.schema as Schema })),
  );
  return server;
}
