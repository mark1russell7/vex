/**
 * This script examines the modes of one case of the compiler gate (GATENOISE). Each fresh process of Node.js is one
 * sample, as each user gets one process. The script starts `gate.ts` in fresh processes, in these variants:
 *
 * - `gate`: all the cases of the gate, in their order, as in CI.
 * - `alone`: only the case, so no other case changes the heap or the JIT before it.
 * - `trace`: only the case, with `--trace-opt`, `--trace-deopt` and `--trace-gc`. Each sample also has its tiers, its
 *   deopts and its collections of garbage.
 * - `gate-fresh`: all the cases, with `GATE_FRESH_BATCH=1`: each arm has a timing loop of its own source.
 * - `gate-trace`: all the cases with the same traces. The events are only the ones of the case: the output after the
 *   result of the case before it.
 *
 * A sample is valid only when its A/A band contains 1.0. The output gives each sample, then the spread of each
 * variant. The third argument names the functions of the trace, and the fourth the variants (default `gate,gate-fresh`). Run it in CI only:
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

/** This function gives the collections of garbage of a trace: the count and the pause in ms of each kind. */
function gcOf(trace: string): readonly string[] {
  const kinds = new Map<string, { n: number; ms: number }>();
  for (const m of trace.matchAll(/ms: ([A-Z][\w -]*?(?: \([\w -]+\))?) [\d.]+ \([\d.]+\) -> [\d.]+ \([\d.]+\) MB, (?:pooled: [\d.]+ MB, )?([\d.]+) \/ [\d.]+ ms/gu)) {
    const k = kinds.get(m[1] ?? "") ?? { n: 0, ms: 0 };
    kinds.set(m[1] ?? "", { n: k.n + 1, ms: k.ms + Number(m[2]) });
  }
  return [...kinds].map(([k, v]) => `gc ${k} ×${String(v.n)}, ${v.ms.toFixed(1)} ms`);
}

/** This function gives the part of the output of a process that belongs to the case: after the result line before it. */
function segmentOf(stdout: string): string {
  const lines = stdout.split("\n");
  const at = lines.findIndex((l) => l.includes(part) && LINE.test(l));
  let from = at;
  while (from > 0 && !/^(?:ok|FAIL) /u.test(lines[from - 1] ?? "")) from--;
  return lines.slice(from, at + 1).join("\n");
}

/** This function starts one fresh process of the gate and gives the sample of the case, or undefined without it. */
function sample(flags: readonly string[], alone: boolean, extra: Readonly<Record<string, string>> = {}): Sample | undefined {
  const env: Record<string, string | undefined> = { ...process.env, ...extra };
  if (alone) env["GATE_CASE"] = part;
  else delete env["GATE_CASE"];
  const out = spawnSync(process.execPath, [...flags, gate], { env, encoding: "utf8", maxBuffer: 1 << 28 });
  const line = out.stdout.split("\n").find((l) => l.includes(part) && LINE.test(l));
  const m = line === undefined ? null : LINE.exec(line);
  if (m === null) return undefined;
  const [, generated, loops, ratio, lo, hi] = m.map(Number);
  return { ratio: ratio ?? Number.NaN, generated: generated ?? Number.NaN, loops: loops ?? Number.NaN, aa: [lo ?? Number.NaN, hi ?? Number.NaN], events: flags.length === 0 ? [] : [...eventsOf(segmentOf(out.stdout)), ...gcOf(segmentOf(out.stdout))] };
}

const VARIANTS = [
  { name: "gate", flags: [], alone: false, n: count, extra: {} },
  { name: "gate-fresh", flags: [], alone: false, n: count, extra: { GATE_FRESH_BATCH: "1" } },
  { name: "alone", flags: [], alone: true, n: count, extra: {} },
  { name: "trace", flags: ["--trace-opt", "--trace-deopt", "--trace-gc"], alone: true, n: Math.ceil(count / 2), extra: {} },
  { name: "gate-trace", flags: ["--trace-opt", "--trace-deopt", "--trace-gc"], alone: false, n: count, extra: {} },
] as const;
const chosen = new Set((process.argv[5] ?? "gate,gate-fresh").split(","));

const runner = spawnSync(process.execPath, ["-e", "console.log(require('node:os').cpus()[0]?.model ?? 'unknown')"], { encoding: "utf8" }).stdout.trim();
console.info(`runner: ${runner}, Node.js ${process.version}, case "${part}", ${String(count)} processes`);
for (const v of VARIANTS.filter((x) => chosen.has(x.name))) {
  const valid: number[] = [];
  for (let i = 1; i <= v.n; i++) {
    const s = sample(v.flags, v.alone, v.extra);
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
