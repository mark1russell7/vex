# @mark1russell7/vex-mcp

The MCP server of [Vex](https://mark1russell7.github.io/vex/). Its tools give the catalog of the domains, and they check, evaluate, explain and compile a program as JSON. An agent can test a program with these tools before it writes the program into the code of a project.

## The tools

| Tool | What it gives |
|---|---|
| `vex_catalog` | Each domain and each op: its call, its result, its lifting, its laws and its identity. The input `domain` gives one domain. |
| `vex_check` | The number of nodes, the nesting, the fields that the program reads, and if the compiler gives it generated code |
| `vex_evaluate` | The value or the error at each key of a space of records |
| `vex_explain` | The trace at one key: each node, with its focus, its reads and its result |
| `vex_module` | The source of a standalone ES module, or the reason that the program cannot be one |

A program is the JSON form of the IR, as `serialize` gives it, or a document of [coeval](https://github.com/mark1russell7/coeval), as `toDocument` gives it. A value of a domain in a program, in the records or in the variables has the form `{ "$vex": "domain", "domain": "Vec2", "value": [1, 2] }`. A result has the same form.

## Start the server

The plugin of Vex for Claude Code starts the server with `plugins/vex/mcp.mjs`. In a working copy of this repository, the server starts from its source, so its tools have the features of the copy. In another install, it starts from npm.

To add the server to Claude Code without the plugin:

```sh
claude mcp add vex -- npx -y @mark1russell7/vex-mcp
```

To start it from the source of this repository:

```sh
cd packages/mcp
npx tsx src/main.ts
```

## The host

Each tool is a procedure of [`@procedures/client`](https://www.npmjs.com/package/@procedures/client) in the module `vex` (`vexModule`). The function `createHost` serves the module with `createMcpHost` of [`@procedures/mcp-server`](https://www.npmjs.com/package/@procedures/mcp-server), as the other procedure servers of the family do. The path `["vex", "check"]` gives the tool `vex_check`.

Each tool reads and writes nothing outside its input, so it has the effects `{ reads: [], writes: [], idempotent: true }`. The client sees each tool as read-only, idempotent and closed.

The command `vex-mcp` gives the host to the runner of [`@mark1russell7/service`](https://www.npmjs.com/package/@mark1russell7/service). The runner starts the host and owns the signals. The end of the standard input, SIGINT and SIGTERM stop the host in stages, and then the process exits.

```ts
import { ephemeral, service } from "@mark1russell7/service";
import { createHost } from "@mark1russell7/vex-mcp";

// The default face is the standard input and output.
await createHost().declare(service("vex-mcp").profile(ephemeral)).run();
```

A test or another program can start the host without the runner. Then the host stops when its client closes the standard input.

```ts
const host = createHost();
await host.start();
await host.closed;
```
