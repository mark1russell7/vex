/**
 * The CPU profile of one case of the speed gate of the compiler (RADIALGAP). This script starts `gate.ts` with
 * `GATE_CASE` in `PROFILE_PROCESSES` fresh processes (3 by default), each with `--cpu-prof`, and adds their samples.
 *
 * The output gives the time of each arm, from the samples under its entry function (`PROFILE_ARMS`), and the self
 * time of the functions under each arm. The `.cpuprofile` files stay in `PROFILE_DIR` for the artifact of the job.
 * Timing runs in CI only. Start: GATE_CASE=3 node packages/compiler/bench/profile.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** One node of a `.cpuprofile` of V8. */
interface ProfileNode {
  readonly id: number;
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
  readonly children?: readonly number[];
}

/** A `.cpuprofile` of V8: the call tree, the node of each sample, and the time before each sample in µs. */
interface Profile {
  readonly nodes: readonly ProfileNode[];
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

const which = process.env["GATE_CASE"];
if (which === undefined || !/^\d+$/u.test(which)) throw new RangeError(`profile: GATE_CASE is "${String(which)}", not a case number.`);
const count = Number(process.env["PROFILE_PROCESSES"] ?? "3");
if (!Number.isInteger(count) || count < 1) throw new RangeError(`profile: PROFILE_PROCESSES is "${String(process.env["PROFILE_PROCESSES"])}".`);
// The generated module of radial is the function `radial` (gate.ts), and the hand arm is `radialArrange`.
const arms = (process.env["PROFILE_ARMS"] ?? "radial,radialArrange").split(",");
const dir = resolve(process.env["PROFILE_DIR"] ?? "profiles");
mkdirSync(dir, { recursive: true });
const gate = fileURLToPath(new URL("gate.ts", import.meta.url));
// The optimizer puts small functions into their callers, and then their time is the self time of the caller.
// `PROFILE_NODE_FLAGS=--no-turbo-inlining` keeps each function apart, at the cost of a slower run.
const flags = (process.env["PROFILE_NODE_FLAGS"] ?? "").split(" ").filter((f) => f !== "");

for (let p = 1; p <= count; p++) {
  const out = spawnSync(process.execPath, [...flags, "--cpu-prof", "--cpu-prof-dir", dir, "--cpu-prof-name", `case${which}-p${String(p)}.cpuprofile`, gate], { encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, GATE_CASE: which } });
  for (const line of out.stdout.split("\n")) if (/^(?:runner|ok|FAIL)/u.test(line)) console.info(`  p${String(p)} ${line}`);
  if (out.status !== 0 && out.status !== 1) throw new Error(`profile: process ${String(p)} ended with ${String(out.status ?? out.signal)}: ${out.stderr.trim().split("\n").slice(-3).join(" | ")}`);
}

/** The self time of a function under one arm, in µs, by its name, its file and its line. */
const self = new Map<string, Map<string, number>>(arms.map((a) => [a, new Map()]));
const total = new Map<string, number>(arms.map((a) => [a, 0]));
for (const file of readdirSync(dir).filter((f) => f.startsWith(`case${which}-`) && f.endsWith(".cpuprofile"))) {
  const profile = JSON.parse(readFileSync(join(dir, file), "utf8")) as Profile;
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  // The arm of a node is the nearest entry function above it, or none.
  const armOf = new Map<number, string | undefined>();
  const arm = (id: number): string | undefined => {
    if (armOf.has(id)) return armOf.get(id);
    const name = byId.get(id)?.callFrame.functionName ?? "";
    const up = parent.get(id);
    const a = arms.includes(name) ? name : up === undefined ? undefined : arm(up);
    armOf.set(id, a);
    return a;
  };
  for (const [i, id] of profile.samples.entries()) {
    const a = arm(id);
    const node = byId.get(id);
    if (a === undefined || node === undefined) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    const f = node.callFrame;
    const key = `${f.functionName === "" ? "(anonymous)" : f.functionName} ${f.url === "" ? "(eval)" : basename(f.url)}:${String(f.lineNumber + 1)}`;
    const m = self.get(a);
    m?.set(key, (m.get(key) ?? 0) + dt);
    total.set(a, (total.get(a) ?? 0) + dt);
  }
}

console.info(`case ${which}, ${String(count)} processes: the time under each arm, and the self time of its top functions`);
for (const a of arms) {
  const t = total.get(a) ?? 0;
  console.info(`arm ${a}: ${(t / 1000).toFixed(1)} ms`);
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  const top = [...(self.get(a) ?? new Map<string, number>())];
  // oxlint-disable-next-line unicorn/no-array-sort
  top.sort((x, y) => y[1] - x[1]);
  for (const [key, us] of top.slice(0, 25)) console.info(`  ${(t === 0 ? 0 : (100 * us) / t).toFixed(1).padStart(5)} %  ${(us / 1000).toFixed(1).padStart(8)} ms  ${key}`);
}
