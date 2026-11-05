// The gate of the limit of the places (COMPILE.PLACES). A fresh process compiles each doubling program with a heap of
// 2,048 MB, and the gate reads the peak of its memory. The workflow removes the limit for the rows, so the rows over the
// limit reach the compile. The workflow reads the limit first, and the gate checks the rows against it.
//
//   node bench/places.ts limit            prints the limit
//   node bench/places.ts rows <limit>     measures the largest program of each shape, and 2 and 4 times its places
//
// The setting PLACES_FAULT gives each child more memory than the line of a row. The workflow reads the gate with it, so the
// gate must fail on the measure (rule 8i).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { emitModule } from "../src/module.ts";
import { generate } from "../src/tiers.ts";
import { MAX_PLACES, placesOf } from "../src/unshared.ts";
import { HEAP_MB, namedFaults, OVER_DEPTHS, placesFaults, RECORD_DEPTHS, SHAPES, worstRows, type PlacesRow } from "../test/places.ts";

/** The processes of each row. The gate reads the worst one. */
const SAMPLES = 5;
/** The most milliseconds of one compile. A compile that takes more gives no result. */
const LIMIT_MS = 120_000;
const MODES = ["module", "tier2"];
const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;

/** This function gives one program. */
function programOf(shape: string, depth: number): Expr {
  const make = SHAPES.find(([name]) => name === shape)?.[1];
  if (make === undefined) throw new Error(`no shape ${shape}`);
  return make(depth);
}

/** The size of the fault in MB: it is over the line of 1,024 MB of a row. */
const FAULT_MB = 1100;

/** This function compiles one program, and it prints its record. */
function child(mode: string, shape: string, depth: number): void {
  // The fill touches each page, so the memory counts in the peak of the process.
  const fault = process.env["PLACES_FAULT"] === undefined ? undefined : Buffer.alloc(FAULT_MB * 1024 * 1024, 1);
  const e = programOf(shape, depth);
  const start = performance.now();
  const r = mode === "module" ? emitModule(e, OPTIONS) : generate(e, OPTIONS);
  const ms = Math.round(performance.now() - start);
  console.info(JSON.stringify({ ok: r.ok, ms, bytes: r.ok ? r.source.length : undefined, rssMB: Math.round(process.resourceUsage().maxRSS / 1024), fault: fault?.length }));
}

/** This function gives the row of one process, and it prints a line with the facts of the process. */
function sample(mode: string, shape: string, depth: number): PlacesRow {
  const args = [`--max-old-space-size=${String(HEAP_MB)}`, fileURLToPath(import.meta.url), "child", mode, shape, String(depth)];
  const r = spawnSync(process.execPath, args, { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
  const line = r.status === 0 ? r.stdout.trim().split("\n").at(-1) : undefined;
  const record = line === undefined ? undefined : (JSON.parse(line) as { readonly ok: boolean; readonly rssMB: number });
  console.info(`row ${mode} ${shape} depth=${String(depth)} places=${String(placesOf([programOf(shape, depth)]))} ${line ?? `no result: exit ${String(r.status)} signal ${String(r.signal)}`}`);
  return { mode, shape, depth, rssMB: record?.ok === true ? record.rssMB : undefined };
}

/** This function checks the names of the rows, measures each row, and fails on a fault of the rule. */
function gate(limit: number): void {
  const named = namedFaults(limit);
  for (const fault of named) console.error(`FAIL ${fault}`);
  if (named.length > 0) {
    process.exitCode = 1;
    return;
  }
  const cells = SHAPES.flatMap(([shape, , depth]) => [0, RECORD_DEPTHS, OVER_DEPTHS].map((more) => [shape, depth + more] as const));
  const rows = MODES.flatMap((mode) => cells.flatMap(([shape, depth]) => Array.from({ length: SAMPLES }, () => sample(mode, shape, depth))));
  const worst = worstRows(rows);
  for (const r of worst) console.info(`worst ${r.mode} ${r.shape} depth=${String(r.depth)} ${r.rssMB === undefined ? "no result" : `${String(r.rssMB)} MB`}`);
  const faults = placesFaults(worst);
  for (const fault of faults) console.error(`FAIL ${fault}`);
  if (faults.length > 0) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "limit") console.info(MAX_PLACES);
else if (command === "rows") gate(Number(rest[0]));
else if (command === "child") child(rest[0] ?? "", rest[1] ?? "", Number(rest[2]));
else throw new Error(`no command ${command}`);
