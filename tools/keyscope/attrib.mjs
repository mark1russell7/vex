// Where the compile time goes, on the branch and on its base. Throwaway measure of a draft pull request.
// Part 1: the compile of each module of ireko in fresh processes, with the arms branch, base and again (A/A).
// Part 2: CPU profiles of the same cells on both arms. Each line gives the mean over the rounds, in ms.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const [branchDir, baseDir] = process.argv.slice(2);
const IREKO_ROUNDS = 7;
const PROFILE_ROUNDS = 3;
const LIMIT_MS = 120_000;
const HEAP = "--max-old-space-size=2048";
const MODULES = ["grid", "radial", "layers", "tree", "shape", "place", "measure", "straight", "orthogonal", "avoid", "direction", "label", "obstacles", "overlap", "bounds", "between"];
const CELLS = [
  ["cost-child.mjs", "module", "loop", "14", "json"],
  ["cost-child.mjs", "module", "constant", "14", "json"],
  ["cost-child.mjs", "module", "plain", "14", "json"],
  ["ireko-child.mjs", "avoid"],
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const f2 = (x) => x.toFixed(2);
const script = (dir, name) => join(dir, "packages/pilots/scripts", name);

function run(args) {
  const r = spawnSync(process.execPath, [HEAP, ...args], { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`exit ${r.status} signal ${r.signal}: ${args.join(" ")}\n${r.stderr.slice(0, 600)}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

// Part 1.
const totals = { branch: 0, base: 0, again: 0 };
for (const which of MODULES) {
  const times = { branch: [], base: [], again: [] };
  const pairs = [];
  for (let round = 0; round < IREKO_ROUNDS; round++) {
    const order = [["branch", branchDir], ["base", baseDir], ["again", branchDir]];
    for (let i = 0; i < round % 3; i++) order.push(order.shift());
    const got = {};
    for (const [arm, dir] of order) {
      got[arm] = run([script(dir, "ireko-child.mjs"), which]).ms;
      times[arm].push(got[arm]);
    }
    pairs.push(got.branch / got.base);
  }
  const m = { branch: median(times.branch), base: median(times.base), again: median(times.again) };
  for (const arm of Object.keys(totals)) totals[arm] += m[arm];
  console.info(`IREKO ${which} n=${IREKO_ROUNDS} base=${f2(m.base)} branch=${f2(m.branch)} ratio=${f2(m.branch / m.base)} aa=${f2(m.again / m.branch)} worstPair=${f2(Math.max(...pairs))}`);
}
console.info(`IREKO all base=${f2(totals.base)} branch=${f2(totals.branch)} ratio=${f2(totals.branch / totals.base)} aa=${f2(totals.again / totals.branch)}`);

// Part 2.
const keyOf = (frame) => `${frame.functionName || "(anonymous)"} ${basename(frame.url || "")}:${frame.lineNumber}`;

/** This function gives the self time and the inclusive time of each function of a profile, in ms. */
function read(file) {
  const p = JSON.parse(readFileSync(file, "utf8"));
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const own = new Map();
  p.samples.forEach((id, i) => own.set(id, (own.get(id) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000));
  const self = new Map();
  const inclusive = new Map();
  const walk = (node, stack) => {
    const key = keyOf(node.callFrame);
    const mine = own.get(node.id) ?? 0;
    self.set(key, (self.get(key) ?? 0) + mine);
    const fresh = !stack.has(key);
    if (fresh) stack.add(key);
    let total = mine;
    for (const c of node.children ?? []) total += walk(byId.get(c), stack);
    if (fresh) {
      stack.delete(key);
      inclusive.set(key, (inclusive.get(key) ?? 0) + total);
    }
    return total;
  };
  walk(p.nodes[0], new Set());
  return { self, inclusive };
}

function profiles(dir, cell) {
  const self = new Map();
  const inclusive = new Map();
  for (let round = 0; round < PROFILE_ROUNDS; round++) {
    const out = mkdtempSync(join(tmpdir(), "prof-"));
    run(["--stack-size=4000", "--cpu-prof", `--cpu-prof-dir=${out}`, "--cpu-prof-interval=500", script(dir, cell[0]), ...cell.slice(1)]);
    const one = read(join(out, readdirSync(out).find((f) => f.endsWith(".cpuprofile"))));
    for (const [k, v] of one.self) self.set(k, (self.get(k) ?? 0) + v / PROFILE_ROUNDS);
    for (const [k, v] of one.inclusive) inclusive.set(k, (inclusive.get(k) ?? 0) + v / PROFILE_ROUNDS);
    rmSync(out, { recursive: true });
  }
  return { self, inclusive };
}

function compare(label, kind, branch, base) {
  const keys = new Set([...branch.keys(), ...base.keys()]);
  const rows = [...keys].map((k) => ({ k, a: branch.get(k) ?? 0, b: base.get(k) ?? 0 })).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
  for (const r of rows.slice(0, kind === "self" ? 25 : 40)) console.info(`ATTRIB ${label} ${kind} branch=${f2(r.a)} base=${f2(r.b)} gap=${f2(r.a - r.b)} ${r.k}`);
}

for (const cell of CELLS) {
  const label = cell.slice(1).join("-");
  const branch = profiles(branchDir, cell);
  const base = profiles(baseDir, cell);
  compare(label, "self", branch.self, base.self);
  compare(label, "inclusive", branch.inclusive, base.inclusive);
}
console.info(`ATTRIB done ${basename(dirname(branchDir))}`);
