/**
 * The MCP server of Vex. Its tools give the catalog of the domains, and they check, evaluate, explain and compile a
 * program as JSON. An agent can test a program with them before it writes the program into the code of a project.
 *
 * Each tool is a procedure of `@procedures/client` in the module `vex`. The host of `@procedures/mcp-server` serves
 * the module, as the other procedure servers of the family do. The path `["vex", "check"]` gives the tool `vex_check`.
 */
import { createRegistry, defineModule, defineProcedure, type ProcedureModule } from "@procedures/client";
import { createMcpHost, type McpHost, type McpHostOptions } from "@procedures/mcp-server";
import { readFileSync } from "node:fs";
import type { Schema } from "@mark1russell7/vex-compiler";
import { z } from "zod";
import { catalogText, CATALOG, domainText } from "./catalog.ts";
import { check, evaluateAll, explainAt, moduleOf, ToolError } from "./tools.ts";

const program = z.unknown().describe('The program as the JSON form of the IR, for example {"tag":"app","op":"add","args":[{"tag":"ref","path":["n"]},{"tag":"lit","value":1}]}, or as a document of coeval, for example {"type":["ops","add"],"value":[{"type":"ref","value":["self","n"]},1]}');
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

/** The version of the package. The file package.json is one folder above the source and above the build. */
const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { readonly version: string }).version;

/**
 * The effects of each tool. A tool reads and writes nothing outside its input, and the same input gives the same
 * result. Thus each tool is read-only, idempotent and closed, and a read-only host serves all five.
 */
const PURE = { reads: [], writes: [], idempotent: true };

/** A text of the catalog, or a value that the host gives as JSON text. */
const text = z.string();
const json = z.unknown();

/** The five tools of Vex, as the procedures of the module `vex`. */
export const vexModule: ProcedureModule = defineModule("vex", [
  defineProcedure({
    path: ["vex", "catalog"],
    input: z.object({ domain: z.string().optional().describe("One domain by its import name, for example Vec2Domain. Without it, the tool gives the whole catalog.") }),
    output: text,
    metadata: {
      title: "The catalog of the domains of Vex",
      description: "Gives each domain of @mark1russell7/vex-domains and each op: its call, its result, its lifting, its laws and its identity. Read it before a program uses an op, and before you write a host function for math.",
      effects: PURE,
    },
    handler: ({ domain }) => {
      if (domain === undefined) return catalogText();
      const entry = CATALOG.find((x) => x.name === domain || x.d.name === domain);
      if (entry === undefined) throw new ToolError(`no domain of the catalog has the name "${domain}". The names are ${CATALOG.map((x) => x.name).join(", ")}`);
      return domainText(entry);
    },
  }),
  defineProcedure({
    path: ["vex", "check"],
    input: z.object({ program, domains }),
    output: json,
    metadata: {
      title: "Check a Vex program",
      description: "Checks a program as JSON. Gives its number of nodes, its nesting, the fields that it reads, and if the compiler gives it generated code. A program that is not valid gives the reason.",
      effects: PURE,
    },
    handler: (input) => check(input),
  }),
  defineProcedure({
    path: ["vex", "evaluate"],
    input: z.object({ program, space: spaceInput, origins: z.array(z.string()).optional().describe("The keys to evaluate at. The default is each key."), domains, vars }),
    output: json,
    metadata: {
      title: "Evaluate a Vex program",
      description: "Evaluates a program at each key of a space of records, or at each key of origins. Gives the value at each key, or the error with its code, kind, message and the path of its node.",
      effects: PURE,
    },
    handler: (input) => evaluateAll(input),
  }),
  defineProcedure({
    path: ["vex", "explain"],
    input: z.object({ program, space: spaceInput, origin: z.string().describe("The key to evaluate at"), domains, vars }),
    output: json,
    metadata: {
      title: "Explain a Vex program at one key",
      description: "Gives the trace of a program at one key: each node, with its focus, its reads and its result. Use it to find where an error starts.",
      effects: PURE,
    },
    handler: (input) => explainAt(input),
  }),
  defineProcedure({
    path: ["vex", "module"],
    input: z.object({
      program,
      domains,
      schema: z
        .object({ fields: z.record(z.string(), z.string()).optional(), vars: z.record(z.string(), z.string()).optional() })
        .describe('The kind of each field and variable: number, string, boolean, or domain:Name, for example {"fields":{"w":"number"}}'),
      name: z.string().optional().describe("The name of the exported function. The default is run."),
    }),
    output: json,
    metadata: {
      title: "Compile a Vex program into a standalone module",
      description: "Gives the source of a standalone ES module of a program, without Vex at run time, or the reason that the program cannot be one. The schema gives the kind of each field and variable.",
      effects: PURE,
    },
    // The kinds of the schema are texts here, and the compiler checks each kind.
    handler: (input) => moduleOf({ ...input, schema: input.schema as Schema }),
  }),
]);

/** The instructions of the server for its client. */
const INSTRUCTIONS =
  "Vex evaluates one formula at each record of a collection, a tree or a grid. Read vex_catalog before a program uses an op. Test a program with vex_check, vex_evaluate and vex_explain before you write it into a project. vex_module gives a standalone module of a program.";

/**
 * This function makes the host of the tools. It starts nothing: the caller starts it. The default face is the
 * standard input and output. The host stops when its client closes the standard input.
 */
export function createHost(faces: McpHostOptions["faces"] = { stdio: true }): McpHost {
  return createMcpHost({
    registry: createRegistry(vexModule),
    // The registry also has the procedures of the client, so the surface keeps only the tools of Vex.
    surface: { namespaces: ["vex"] },
    toolName: (path) => path.join("_"),
    name: "vex",
    version: VERSION,
    instructions: INSTRUCTIONS,
    faces,
  });
}
