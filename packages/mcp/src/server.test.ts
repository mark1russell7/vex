import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "./server.ts";

/** This function gives a client connected to a new server, through a transport in memory. */
async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

/** This function gives the text of the first content of a result of a tool. */
const textOf = (r: Awaited<ReturnType<Client["callTool"]>>): string => (r.content as readonly { readonly text: string }[])[0]?.text ?? "";

describe("the MCP server of Vex", () => {
  it("lists its tools, each with a description", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["vex_catalog", "vex_check", "vex_evaluate", "vex_explain", "vex_module"]);
    expect(tools.every((t) => (t.description ?? "").length > 40)).toBe(true);
  });

  it("gives the catalog of one domain, and an error of the tool for an unknown domain", async () => {
    const client = await connect();
    expect(textOf(await client.callTool({ name: "vex_catalog", arguments: { domain: "Vec2Domain" } }))).toContain("## `Vec2Domain`");
    expect(textOf(await client.callTool({ name: "vex_catalog", arguments: {} }))).toContain("# The catalog of the domains");
    const unknown = await client.callTool({ name: "vex_catalog", arguments: { domain: "Nope" } });
    expect([unknown.isError, textOf(unknown)]).toEqual([true, expect.stringContaining('no domain of the catalog has the name "Nope"') as unknown]);
  });

  it("evaluates a program at each key, and checks, explains and compiles it", async () => {
    const client = await connect();
    const program = { tag: "app", op: "multiply", args: [{ tag: "ref", path: ["n"] }, { tag: "lit", value: 2 }] };
    const space = { kind: "array", records: [{ n: 1 }, { n: 4 }] };
    expect(JSON.parse(textOf(await client.callTool({ name: "vex_evaluate", arguments: { program, space } })))).toEqual([
      { key: "0", ok: true, value: 2 },
      { key: "1", ok: true, value: 8 },
    ]);
    expect(JSON.parse(textOf(await client.callTool({ name: "vex_check", arguments: { program } })))).toMatchObject({ ok: true, nodes: 3 });
    expect(textOf(await client.callTool({ name: "vex_explain", arguments: { program, space, origin: "1" } }))).toContain("8");
    expect(textOf(await client.callTool({ name: "vex_module", arguments: { program, domains: ["NumDomain"], schema: { fields: { n: "number" } } } }))).toContain("export function run(");
    const bad = await client.callTool({ name: "vex_check", arguments: { program: { tag: "loop" } } });
    expect([bad.isError, textOf(bad)]).toEqual([true, expect.stringContaining("this version of Vex does not know it") as unknown]);
  });
});
