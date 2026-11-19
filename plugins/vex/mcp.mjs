// The start of the MCP server of Vex for the plugin. The one procedures server of `@procedures/mcp-dev-tools` with the
// module entry of `@mark1russell7/vex-mcp` (`MCP_BUNDLES`) and the own server of the package give the same five tools,
// results and instructions (packages/mcp/src/one-server.test.ts).
//
// In a working copy of the repository with its packages installed, the launcher starts the one server, and the one
// server loads the module entry from its source with tsx. Thus the tools have the features of the copy.
//
// In another install of the plugin, npx gets the own server from npm. The one server from npm is not used yet:
// `@procedures/mcp-dev-tools` brings all its developer tools (423 packages, against 127 for `vex-mcp`). A first start
// then took 41 s, and Claude Code stops the start of an MCP server after 30 s (MCP_TIMEOUT). The npm path moves to the
// one server when a lean bin of the one server starts well in that time.
//
// On a machine with the MCP gateway of headroom, the sessions share one server of the gateway. The tools of Vex keep no
// state of a session, so one server serves each session. The launcher then connects its input and output to the
// gateway through the bridge of headroom, in this process, so the launcher is the only process of the session. Without
// the bridge, or when the gateway does not serve vex, the launcher starts its own server. The launcher looks for
// `bridge.ts`, then `bridge.mjs`. HEADROOM_BRIDGE names another bridge file. A path that does not exist turns the gateway off.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The environment of the one server: the module entry of the tools of Vex, and the name of the server. */
function oneServerEnv(bundle) {
  return { ...process.env, MCP_BUNDLES: bundle, MCP_SERVER_NAME: "vex" };
}

/**
 * This function gives the bin of the one server in a working copy with its packages installed, and else undefined. The
 * package `packages/mcp` has `@procedures/mcp-dev-tools` as a dev dependency. The package gives only its main entry, so
 * the bin is next to it.
 */
function localBin(pkg) {
  if (!existsSync(join(pkg, "node_modules")) || !existsSync(join(pkg, "src", "module.ts"))) return undefined;
  try {
    return join(dirname(createRequire(join(pkg, "package.json")).resolve("@procedures/mcp-dev-tools")), "bin.js");
  } catch {
    // A working copy that has no install of the one server starts the own server from npm.
    return undefined;
  }
}

/** This function starts the server of the session: the one server in a working copy, and else the own server from npm. */
function startLocal() {
  const pkg = join(here, "..", "..", "packages", "mcp");
  const bin = localBin(pkg);
  let child;
  if (bin !== undefined) {
    child = spawn(process.execPath, ["--import", "tsx", bin], { cwd: pkg, env: oneServerEnv(join(pkg, "src", "module.ts")), stdio: "inherit" });
  } else {
    const args = ["-y", "@mark1russell7/vex-mcp"];
    const options = { cwd: here, stdio: "inherit" };
    // npx is a script on Windows, so it needs a shell: one command line with quoted arguments.
    child =
      process.platform === "win32" ? spawn(["npx", ...args.map((a) => JSON.stringify(a))].join(" "), { ...options, shell: true }) : spawn("npx", args, options);
  }
  child.on("exit", (code) => process.exit(code ?? 0));
}

/** This function gives the bridge of the gateway when the gateway serves vex, and else undefined. */
async function gateway() {
  // The bridge of headroom is a TypeScript file since headroom #125, and Node.js imports it directly. Older working
  // copies of headroom have the JavaScript file.
  const src = join(homedir(), "git", "headroom", "packages", "daemon", "src");
  const file = process.env["HEADROOM_BRIDGE"] ?? [join(src, "bridge.ts"), join(src, "bridge.mjs")].find((f) => existsSync(f));
  if (file === undefined || !existsSync(file)) return undefined;
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
