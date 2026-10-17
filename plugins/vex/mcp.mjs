// The start of the MCP server of Vex for the plugin. In a working copy of the repository with its packages installed,
// the server starts from its source with tsx, so it has the features of the copy. In another install of the plugin, it
// starts from npm with npx.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "..", "packages", "mcp");
const local = existsSync(join(pkg, "node_modules")) && existsSync(join(pkg, "src", "main.ts"));
const args = local ? ["tsx", join(pkg, "src", "main.ts")] : ["-y", "@mark1russell7/vex-mcp"];
const cwd = local ? pkg : here;
// npx is a script on Windows, so it needs a shell: one command line with quoted arguments.
const child =
  process.platform === "win32" ? spawn(["npx", ...args.map((a) => JSON.stringify(a))].join(" "), { cwd, stdio: "inherit", shell: true }) : spawn("npx", args, { cwd, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
