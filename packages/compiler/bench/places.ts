// The gate of the limit of the places (COMPILE.PLACES). A fresh process compiles each doubling program with a heap of
// 2,048 MB, and the gate reads the peak of its memory. The workflow removes the limit for the rows, so the rows of the
// two depths reach the compile. The workflow reads the depth first, because the limit gives it.
//
//   node bench/places.ts depth            prints the largest depth under the limit
//   node bench/places.ts rows <depth>     measures the depth and the next depth, and fails on a fault of the rule
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { emitModule } from "../src/module.ts";
import { generate } from "../src/tiers.ts";
import { MAX_PLACES } from "../src/unshared.ts";
import { HEAP_MB, placesFaults, SHAPES, worstRows, type PlacesRow } from "../test/places.ts";

/** The processes of each row. The gate reads the worst one. */
const SAMPLES = 3;
/** The most milliseconds of one compile. A compile that takes more gives no result. */
const LIMIT_MS = 120_000;
const MODES = ["module", "tier2"];
const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;

/** This function compiles one program, and it prints its record. */
function child(mode: string, shape: string, depth: number): void {
  const make = SHAPES.find(([name]) => name === shape)?.[1];
  if (make === undefined) throw new Error(`no shape ${shape}`);
  const e = make(depth);
  const start = performance.now();
  const r = mode === "module" ? emitModule(e, OPTIONS) : generate(e, OPTIONS);
  const ms = Math.round(performance.now() - start);
  console.info(JSON.stringify({ ok: r.ok, ms, bytes: r.ok ? r.source.length : undefined, rssMB: Math.round(process.resourceUsage().maxRSS / 1024) }));
}

/** This function gives the row of one process, and it prints a line with the facts of the process. */
function sample(mode: string, shape: string, depth: number): PlacesRow {
  const args = [`--max-old-space-size=${String(HEAP_MB)}`, fileURLToPath(import.meta.url), "child", mode, shape, String(depth)];
  const r = spawnSync(process.execPath, args, { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
  const line = r.status === 0 ? r.stdout.trim().split("\n").at(-1) : undefined;
  const record = line === undefined ? undefined : (JSON.parse(line) as { readonly ok: boolean; readonly rssMB: number });
  console.info(`row ${mode} ${shape} depth=${String(depth)} ${line ?? `no result: exit ${String(r.status)} signal ${String(r.signal)}`}`);
  return { mode, shape, depth, rssMB: record?.ok === true ? record.rssMB : undefined };
}

/** This function measures each row of the two depths, and it fails on a fault of the rule. */
function gate(depth: number): void {
  const rows = [depth, depth + 1].flatMap((d) => MODES.flatMap((mode) => SHAPES.flatMap(([shape]) => Array.from({ length: SAMPLES }, () => sample(mode, shape, d)))));
  const worst = worstRows(rows);
  for (const r of worst) console.info(`worst ${r.mode} ${r.shape} depth=${String(r.depth)} ${r.rssMB === undefined ? "no result" : `${String(r.rssMB)} MB`}`);
  const faults = placesFaults(worst, depth);
  for (const fault of faults) console.error(`FAIL ${fault}`);
  if (faults.length > 0) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "depth") console.info(Math.log2(MAX_PLACES) - 1);
else if (command === "rows") gate(Number(rest[0]));
else if (command === "child") child(rest[0] ?? "", rest[1] ?? "", Number(rest[2]));
else throw new Error(`no command ${String(command)}`);
