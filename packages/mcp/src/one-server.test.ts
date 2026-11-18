/**
 * The tools of Vex in the one procedures server. The dev-tools server of `@procedures/mcp-dev-tools` loads the module
 * entry (`src/module.ts`) through `MCP_BUNDLES`, and each of the five tools must give the same result there as in the
 * own server of Vex.
 *
 * The one server names a tool by its path with dots, for example `vex.check`. An MCP client that permits only
 * letters, digits, `_` and `-` in a tool name, for example Claude Code, changes each other character to `_`. So the
 * test compares `vex.check` with `vex_check`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHost } from "./server.ts";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const moduleFile = fileURLToPath(new URL("./module.ts", import.meta.url));
// The package gives only its main entry, so the bin is next to it
const oneServerBin = join(dirname(createRequire(import.meta.url).resolve("@procedures/mcp-dev-tools")), "bin.js");

/** A tool name as an MCP client that permits only letters, digits, `_` and `-` gives it. */
const clientName = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, "_");

type Result = Awaited<ReturnType<Client["callTool"]>>;
type Tools = Awaited<ReturnType<Client["listTools"]>>["tools"];

/** The parts of each tool that the model reads, by the name that the client gives, in the order of the names. */
const shape = (tools: Tools) =>
  tools
    .map((t) => ({ name: clientName(t.name), title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }))
    .toSorted((a, b) => (a.name < b.name ? -1 : 1));

/** The parts of a result of a tool that the model reads. */
const partsOf = (result: Result) => ({ content: result.content, structuredContent: result.structuredContent, isError: result.isError === true });

const program = { tag: "app", op: "multiply", args: [{ tag: "ref", path: ["n"] }, { tag: "lit", value: 2 }] };
const space = { kind: "array", records: [{ n: 1 }, { n: 4 }] };

/** The calls of the comparison: each tool with a good input, and two inputs that a tool refuses. */
const CALLS: readonly { readonly label: string; readonly tool: string; readonly arguments: Record<string, unknown>; readonly refused?: true }[] = [
  { label: "vex.catalog of one domain", tool: "catalog", arguments: { domain: "Vec2Domain" } },
  { label: "vex.catalog of all domains", tool: "catalog", arguments: {} },
  { label: "vex.catalog of an unknown domain", tool: "catalog", arguments: { domain: "Nope" }, refused: true },
  { label: "vex.check", tool: "check", arguments: { program } },
  { label: "vex.check of an unknown node", tool: "check", arguments: { program: { tag: "loop" } }, refused: true },
  { label: "vex.evaluate", tool: "evaluate", arguments: { program, space } },
  { label: "vex.explain", tool: "explain", arguments: { program, space, origin: "1" } },
  { label: "vex.module", tool: "module", arguments: { program, domains: ["NumDomain"], schema: { fields: { n: "number" } } } },
];

let own: Client;
let one: Client;

beforeAll(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createHost({ sdk: serverSide }).start();
  own = new Client({ name: "test", version: "0.0.0" });
  await own.connect(clientSide);
  // tsx loads the module entry from its TypeScript source, as in a working copy of the repository
  one = new Client({ name: "test", version: "0.0.0" });
  await one.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", oneServerBin],
      cwd: packageDir,
      env: { ...getDefaultEnvironment(), MCP_BUNDLES: moduleFile, MCP_SERVER_NAME: "vex" },
      stderr: "ignore",
    }),
  );
}, 60_000);

afterAll(async () => {
  await one?.close();
  await own?.close();
});

describe("the tools of Vex in the one procedures server", () => {
  it("lists the same five tools, with the same descriptions, input schemas and hints", async () => {
    const ownTools = shape((await own.listTools()).tools);
    expect(ownTools.map((t) => t.name)).toEqual(["vex_catalog", "vex_check", "vex_evaluate", "vex_explain", "vex_module"]);
    expect(shape((await one.listTools()).tools)).toEqual(ownTools);
  });

  it.each(CALLS.map((call) => [call.label, call] as const))("gives the same result for %s", async (_label, call) => {
    const ownResult = await own.callTool({ name: `vex_${call.tool}`, arguments: call.arguments });
    const oneResult = await one.callTool({ name: `vex.${call.tool}`, arguments: call.arguments });
    // The two servers must not agree only because the two refuse the call
    expect(partsOf(ownResult).isError).toBe(call.refused === true);
    expect(partsOf(oneResult)).toEqual(partsOf(ownResult));
  });
});
