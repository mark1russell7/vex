// The start of the MCP server of Vex for the plugin. In a working copy of the repository with its packages installed,
// the server starts from its source with tsx, so it has the features of the copy. In another install of the plugin, it
// starts from npm with npx.
//
// On a machine with the MCP gateway of headroom, the sessions share one server of the gateway. The tools of Vex keep no
// state of a session, so one server serves each session. The launcher then connects its input and output to the
// gateway through the bridge of headroom, in this process, so the launcher is the only process of the session. Without
// the bridge, or when the gateway does not serve vex, the launcher starts its own server. HEADROOM_BRIDGE names another
// bridge file. A path that does not exist turns the gateway off.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** This function starts the own server of the session, from the working copy or from npm. */
function startLocal() {
  const pkg = join(here, "..", "..", "packages", "mcp");
  const local = existsSync(join(pkg, "node_modules")) && existsSync(join(pkg, "src", "main.ts"));
  const args = local ? ["tsx", join(pkg, "src", "main.ts")] : ["-y", "@mark1russell7/vex-mcp"];
  const cwd = local ? pkg : here;
  // npx is a script on Windows, so it needs a shell: one command line with quoted arguments.
  const child =
    process.platform === "win32" ? spawn(["npx", ...args.map((a) => JSON.stringify(a))].join(" "), { cwd, stdio: "inherit", shell: true }) : spawn("npx", args, { cwd, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

/** This function gives the bridge of the gateway when the gateway serves vex, and else undefined. */
async function gateway() {
  const file = process.env["HEADROOM_BRIDGE"] ?? join(homedir(), "git", "headroom", "packages", "daemon", "src", "bridge.mjs");
  if (!existsSync(file)) return undefined;
  try {
    const bridge = /** @type {{ gatewayServes(name: string): Promise<boolean>, runBridge(name: string): void }} */ (await import(pathToFileURL(file).href));
    return (await bridge.gatewayServes("vex")) ? bridge : undefined;
  } catch {
    // A bridge that does not load leaves the own server of the session.
    return undefined;
  }
}

const bridge = await gateway();
if (bridge === undefined) startLocal();
else bridge.runBridge("vex");
