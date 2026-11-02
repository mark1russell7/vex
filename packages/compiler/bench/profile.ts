/**
 * The CPU profile of a command of Node.js, as self time by function and by group (RADIALGAP). The function
 * `profileCommand` starts the command in fresh processes, each with `--cpu-prof`, and adds their samples. This step
 * belongs to the shared bench harness (`mark1russell7/rigor`, planned), so this file keeps only the profile, the sum and
 * the files for the artifact.
 *
 * The script form profiles one case of the gate of the compiler: `GATE_CASE=3 node packages/compiler/bench/profile.ts`.
 * Timing runs in CI only.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
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

/** The options of `profileCommand`. */
export interface ProfileOptions {
  /** This value is the number of fresh processes. */
  readonly processes: number;
  /** This value is the folder of the `.cpuprofile` files. */
  readonly dir: string;
  /** This value is the name of the files, as `<name>-p<process>.cpuprofile`. */
  readonly name: string;
  /** These values are the entry functions of the arms. A sample counts for the nearest arm above it. */
  readonly arms: readonly string[];
  /**
   * These values are the groups: a name, and its functions, each as a name or a full key (`name file:line`). A function
   * can be in more than one group.
   */
  readonly groups: Readonly<Record<string, readonly string[]>>;
  /** These values are more environment variables of the processes. */
  readonly env?: Readonly<Record<string, string>>;
}

/** The self time of one arm, in µs: in all, by function (`name file:line`) and by group. */
export interface ArmTime {
  readonly arm: string;
  readonly total: number;
  readonly byFunction: ReadonlyMap<string, number>;
  readonly byGroup: ReadonlyMap<string, number>;
}

/** The result of `profileCommand`: the time of each arm, and the result lines of each process. */
export interface CommandProfile {
  readonly arms: readonly ArmTime[];
  readonly output: readonly string[];
}

/**
 * This function starts `node <argv>` in fresh processes, each with `--cpu-prof`, and gives the self time of each arm.
 * The node flags go first in `argv`. A process that ends with a status other than 0 or 1 stops the profile.
 */
export function profileCommand(argv: readonly string[], o: ProfileOptions): CommandProfile {
  mkdirSync(o.dir, { recursive: true });
  const output: string[] = [];
  for (let p = 1; p <= o.processes; p++) {
    const out = spawnSync(process.execPath, ["--cpu-prof", "--cpu-prof-dir", o.dir, "--cpu-prof-name", `${o.name}-p${String(p)}.cpuprofile`, ...argv], { encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, ...o.env } });
    output.push(...out.stdout.split("\n").map((l) => `p${String(p)} ${l}`));
    if (out.status !== 0 && out.status !== 1) throw new Error(`profile: process ${String(p)} ended with ${String(out.status ?? out.signal)}: ${out.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  }
  const self = new Map<string, Map<string, number>>(o.arms.map((a) => [a, new Map()]));
  for (const file of readdirSync(o.dir).filter((f) => f.startsWith(`${o.name}-p`) && f.endsWith(".cpuprofile"))) addSamples(JSON.parse(readFileSync(join(o.dir, file), "utf8")) as Profile, o.arms, self);
  const arms = o.arms.map((arm): ArmTime => {
    const byFunction = self.get(arm) ?? new Map<string, number>();
    const total = [...byFunction.values()].reduce((s, us) => s + us, 0);
    const byGroup = new Map(Object.entries(o.groups).map(([g, names]) => [g, [...byFunction].filter(([key]) => names.includes(key) || names.includes(key.slice(0, key.indexOf(" ")))).reduce((s, [, us]) => s + us, 0)]));
    return { arm, total, byFunction, byGroup };
  });
  return { arms, output };
}

/** This function adds the self time of each sample of `profile` to the function of the sample, under its arm. */
function addSamples(profile: Profile, arms: readonly string[], self: Map<string, Map<string, number>>): void {
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
    const f = node.callFrame;
    const key = `${f.functionName === "" ? "(anonymous)" : f.functionName} ${f.url === "" ? "(eval)" : basename(f.url)}:${String(f.lineNumber + 1)}`;
    const m = self.get(a);
    m?.set(key, (m.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
  }
}

/** This function gives the share of `us` in `t` as a percent, for the summary. */
function pct(us: number, t: number): string {
  return (t === 0 ? 0 : (100 * us) / t).toFixed(1).padStart(5);
}

/** This function gives the lines of the summary of a profile: each arm, its groups and its top functions. */
export function profileLines(p: CommandProfile, top: number): readonly string[] {
  const lines: string[] = [];
  for (const a of p.arms) {
    lines.push(`arm ${a.arm}: ${(a.total / 1000).toFixed(1)} ms`);
    for (const [g, us] of a.byGroup) lines.push(`  group ${g}: ${pct(us, a.total)} %  ${(us / 1000).toFixed(1)} ms`);
    // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
    const fns = [...a.byFunction];
    // oxlint-disable-next-line unicorn/no-array-sort
    fns.sort((x, y) => y[1] - x[1]);
    for (const [key, us] of fns.slice(0, top)) lines.push(`  ${pct(us, a.total)} %  ${(us / 1000).toFixed(1).padStart(8)} ms  ${key}`);
  }
  return lines;
}

// The script form: one case of the gate of the compiler. The generated module of radial is the function `radial`
// (gate.ts), and the hand arm is `radialArrange`. `PROFILE_GROUPS` is `name=f1,f2;name=f3`, with names or full keys. The optimizer can put
// small functions into their callers: `PROFILE_NODE_FLAGS=--no-turbo-inlining` keeps each function apart.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const which = process.env["GATE_CASE"];
  if (which === undefined || !/^\d+$/u.test(which)) throw new RangeError(`profile: GATE_CASE is "${String(which)}", not a case number.`);
  const processes = Number(process.env["PROFILE_PROCESSES"] ?? "3");
  if (!Number.isInteger(processes) || processes < 1) throw new RangeError(`profile: PROFILE_PROCESSES is "${String(process.env["PROFILE_PROCESSES"])}".`);
  const groups = Object.fromEntries((process.env["PROFILE_GROUPS"] ?? "").split(";").filter((g) => g.includes("=")).map((g) => [g.slice(0, g.indexOf("=")), g.slice(g.indexOf("=") + 1).split(",")]));
  const flags = (process.env["PROFILE_NODE_FLAGS"] ?? "").split(" ").filter((f) => f !== "");
  const gate = fileURLToPath(new URL("gate.ts", import.meta.url));
  const p = profileCommand([...flags, gate], { processes, dir: resolve(process.env["PROFILE_DIR"] ?? "profiles"), name: `case${which}`, arms: (process.env["PROFILE_ARMS"] ?? "radial,radialArrange").split(","), groups, env: { GATE_CASE: which } });
  for (const line of p.output) if (/^p\d+ (?:runner|ok|FAIL)/u.test(line)) console.info(`  ${line}`);
  console.info(`case ${which}, ${String(processes)} processes: the self time under each arm, by group and by function`);
  for (const line of profileLines(p, 25)) console.info(line);
}
