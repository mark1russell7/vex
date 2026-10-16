# @vex/mcp

The MCP server of [Vex](https://mark1russell7.github.io/vex/). Its tools give the catalog of the domains, and they check, evaluate, explain and compile a program as JSON. An agent can test a program with these tools before it writes the program into the code of a project.

## The tools

| Tool | What it gives |
|---|---|
| `vex_catalog` | Each domain and each op: its call, its result, its lifting, its laws and its identity. The input `domain` gives one domain. |
| `vex_check` | The number of nodes, the nesting, the fields that the program reads, and if the compiler gives it generated code |
| `vex_evaluate` | The value or the error at each key of a space of records |
| `vex_explain` | The trace at one key: each node, with its focus, its reads and its result |
| `vex_module` | The source of a standalone ES module, or the reason that the program cannot be one |

A program is the JSON form of the IR, as `serialize` gives it. A value of a domain in a program, in the records or in the variables has the form `{ "$vex": "domain", "domain": "Vec2", "value": [1, 2] }`. A result has the same form.

## Start the server

The plugin of Vex for Claude Code starts the server: refer to the field `mcpServers` of `plugins/vex/.claude-plugin/plugin.json`. To start it by hand:

```sh
cd packages/mcp
npx tsx src/main.ts
```

The server reads the packages of this repository, so its tools have the features of the main branch.
