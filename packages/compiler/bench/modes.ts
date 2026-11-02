/**
 * This script examines the modes of one case of the compiler gate (GATENOISE). Each fresh process of Node.js is one
 * sample, as each user gets one process. The script starts `gate.ts` in fresh processes, in three variants:
 *
 * - `gate`: all the cases of the gate, in their order, as in CI.
 * - `alone`: only the case, so no other case changes the heap or the JIT before it.
 * - `trace`: only the case, with `--trace-opt` and `--trace-deopt`. Each sample also has its tiers and its deopts.
 *
 * A sample is valid only when its A/A band contains 1.0. The output gives each sample, then the spread of each
 * variant. The third argument names the functions of the trace. Run it in CI only:
 * `node bench/modes.ts "tree module" 20 team,teamHand,CH,PR,AN,push`.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [part = "tree module", text = "20", names = "team,teamHand,CH,PR,AN,push"] = process.argv.slice(2);
const traced = new Set(names.split(","));
const count = Number(text);
const gate = fileURLToPath(new URL("gate.ts", import.meta.url));
const LINE = /generated ([\d.]+) µs, loops ([\d.]+) µs, generated\/loops time ([\d.]+).*A\/A noise ([\d.]+) to ([\d.]+)/u;

interface Sample {
  readonly ratio: number;
  readonly generated: number;
  readonly loops: number;
  readonly aa: readonly [number, number];
  readonly events: readonly string[];
}

/** This function gives the tiers and the deopts of a trace, one entry for each function and event, with a count. */
function eventsOf(trace: string): readonly string[] {
  const counts = new Map<string, number>();
  for (const line of trace.split("\n")) {
    const name = /<JSFunction (\S+)/u.exec(line)?.[1];
    if (name === undefined || !traced.has(name)) continue;
    const target = /completed (?:compiling|optimizing)[^]*\(target (\w+)\)/u.exec(line)?.[1];
    const reason = /bailout \(kind: ([^,]+), reason: ([^)]+)\)/u.exec(line);
    const key = target === undefined ? (reason === null ? undefined : `${name} deopt ${reason[1] ?? ""} (${reason[2] ?? ""})`) : `${name} ${target}`;
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => (n === 1 ? k : `${k} ×${String(n)}`));
}

/** This function starts one fresh process of the gate and gives the sample of the case, or undefined without it. */
function sample(flags: readonly string[], alone: boolean): Sample | undefined {
  const env = alone ? { ...process.env, GATE_CASE: part } : { ...process.env };
  if (!alone) delete env["GATE_CASE"];
  const out = spawnSync(process.execPath, [...flags, gate], { env, encoding: "utf8", maxBuffer: 1 << 28 });
  const line = out.stdout.split("\n").find((l) => l.includes(part) && LINE.test(l));
  const m = line === undefined ? null : LINE.exec(line);
  if (m === null) return undefined;
  const [, generated, loops, ratio, lo, hi] = m.map(Number);
  return { ratio: ratio ?? Number.NaN, generated: generated ?? Number.NaN, loops: loops ?? Number.NaN, aa: [lo ?? Number.NaN, hi ?? Number.NaN], events: flags.length === 0 ? [] : eventsOf(out.stdout) };
}

const VARIANTS = [
  { name: "gate", flags: [], alone: false, n: Math.ceil(count / 2) },
  { name: "alone", flags: [], alone: true, n: count },
  { name: "trace", flags: ["--trace-opt", "--trace-deopt"], alone: true, n: Math.ceil(count / 2) },
] as const;

const runner = spawnSync(process.execPath, ["-e", "console.log(require('node:os').cpus()[0]?.model ?? 'unknown')"], { encoding: "utf8" }).stdout.trim();
console.info(`runner: ${runner}, Node.js ${process.version}, case "${part}", ${String(count)} processes`);
for (const v of VARIANTS) {
  const valid: number[] = [];
  for (let i = 1; i <= v.n; i++) {
    const s = sample(v.flags, v.alone);
    if (s === undefined) {
      console.info(`${v.name} ${String(i)}: no sample`);
      continue;
    }
    const ok = s.aa[0] <= 1 && s.aa[1] >= 1;
    if (ok) valid.push(s.ratio);
    console.info(`${v.name} ${String(i)}: ratio ${s.ratio.toFixed(2)}, generated ${s.generated.toFixed(1)} µs, loops ${s.loops.toFixed(1)} µs, A/A ${s.aa[0].toFixed(2)} to ${s.aa[1].toFixed(2)}${ok ? "" : " (not valid)"}`);
    for (const e of s.events) console.info(`  ${e}`);
  }
  const worst = Math.max(...valid);
  const best = Math.min(...valid);
  const slow = valid.filter((r) => r >= 1.2).length;
  console.info(`summary ${v.name}: ${String(valid.length)} valid of ${String(v.n)}, from ${best.toFixed(2)} to ${worst.toFixed(2)}, ${String(slow)} at 1.20 or more`);
}
