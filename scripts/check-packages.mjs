// The package check (docs/REVIEW.md §8.2, layer L8). This script packs each published package, checks the
// tarball with publint and attw, installs the tarballs in an empty project, and runs a program against them.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const PACKAGES = ["core", "domains", "testkit", "compiler", "mcp"];
const work = mkdtempSync(join(tmpdir(), "vex-pack-"));
// One command line with quoted arguments: pnpm and npm are scripts on Windows, so they need a shell.
/** @type {(cmd: string, args: readonly string[], cwd: string) => void} */
const run = (cmd, args, cwd) => execSync([cmd, ...args.map((a) => JSON.stringify(a))].join(" "), { cwd, stdio: "inherit" });

/**
 * This function starts the command `vex-mcp` of the installed tarball, as the plugin starts it. Over stdio, it lists the
 * tools. Then it closes the input, and the runner of the service must stop the host and exit with the code 0.
 * @type {(main: string) => Promise<void>}
 */
async function checkCommand(main) {
  const child = spawn(process.execPath, [main], { stdio: ["pipe", "pipe", "inherit"] });
  /** @type {Promise<{ code: number | null, signal: string | null }>} */
  const exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  const send = (/** @type {object} */ message) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  let buffer = "";
  const tools = new Promise((done, fail) => {
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        const message = JSON.parse(line);
        if (message.id === 2) done(message.result?.tools?.map((/** @type {{ name: string }} */ t) => t.name));
      }
    });
    child.once("exit", () => fail(new Error("vex-mcp exited before it listed its tools")));
  });
  send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "package-check", version: "0" } } });
  send({ method: "notifications/initialized" });
  send({ id: 2, method: "tools/list" });
  const names = JSON.stringify(await tools);
  if (names !== JSON.stringify(["vex_catalog", "vex_check", "vex_evaluate", "vex_explain", "vex_module"])) throw new Error("vex-mcp listed the tools " + names);
  child.stdin.end();
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const end = await exited;
  clearTimeout(timer);
  if (end.code !== 0) throw new Error("vex-mcp did not exit with the code 0 at the end of its input: " + JSON.stringify(end));
  console.info("package check: vex-mcp lists its tools and exits at the end of its input");
}

try {
  const tarballs = PACKAGES.map((p) => {
    const out = join(work, p);
    mkdirSync(out);
    run("pnpm", ["pack", "--pack-destination", out], join(root, "packages", p));
    const file = readdirSync(out).find((f) => f.endsWith(".tgz"));
    if (file === undefined) throw new Error(`no tarball for ${p}`);
    const tgz = join(out, file);
    run("pnpm", ["exec", "publint", "run", tgz, "--strict"], root);
    run("pnpm", ["exec", "attw", tgz, "--profile", "esm-only"], root);
    return tgz;
  });

  // An empty project that installs the tarballs, as a user installs the packages from npm.
  const app = join(work, "app");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "vex-smoke", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...tarballs], app);
  writeFileSync(
    join(app, "smoke.mjs"),
    `import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { checkLaws } from "@mark1russell7/vex-testkit";
import { tiered } from "@mark1russell7/vex-compiler";
import { catalogText, evaluateAll } from "@mark1russell7/vex-mcp";
import * as fc from "fast-check";

const box = (x, y) => ({ position: new Vec2(x, y) });
const root = vex(Vec2Domain, NumDomain).over(space.record({ A: box(0, 0), B: box(3, 4), C: box(6, 8) }));
const nearest = root.from("position").others((e) => e._.subtract("position")._.length()).min();
const result = nearest.result("A");
if (!result.ok || result.value !== 5) throw new Error("the nearest-box program gave " + JSON.stringify(result));
const compiled = tiered(nearest.program, { domains: [Vec2Domain, NumDomain] });
const fast = compiled.run({ space: root.space, origin: "A" });
if (compiled.tier !== 2 || !fast.ok || fast.value !== 5) throw new Error("the compiled program gave " + JSON.stringify(fast));
const failed = checkLaws(NumDomain, { arb: fc.integer({ min: -100, max: 100 }), numRuns: 50 }).filter((r) => !r.ok);
if (failed.length > 0) throw new Error("law failures: " + JSON.stringify(failed));
if (!catalogText().includes("## \`XYDomain\`")) throw new Error("the catalog of the MCP server has no XYDomain");
const evaluated = evaluateAll({ program: { tag: "app", op: "add", args: [{ tag: "ref", path: ["n"] }, { tag: "lit", value: 1 }] }, space: { kind: "array", records: [{ n: 2 }] } });
if (JSON.stringify(evaluated) !== JSON.stringify([{ key: "0", ok: true, value: 3 }])) throw new Error("the MCP tool vex_evaluate gave " + JSON.stringify(evaluated));
console.info("package check: the tarballs install, import and run");
`,
  );
  run("node", ["smoke.mjs"], app);
  await checkCommand(join(app, "node_modules/@mark1russell7/vex-mcp/build/main.js"));
  // The type Optional comes from a dev dependency, so the declarations must hold a copy of it, not an import.
  const dts = readFileSync(join(app, "node_modules/@mark1russell7/vex/build/index.d.ts"), "utf8");
  if (dts.includes('"@mark1russell7/optional"')) throw new Error("the declarations of @mark1russell7/vex import @mark1russell7/optional");
} finally {
  rmSync(work, { recursive: true, force: true });
}
