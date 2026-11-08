// The gate of the growth of a compile (COMPILE.GROWTH). A fresh process compiles each shape at two sizes, and the gate reads
// the median time and the bytes of the module. The exponent of each against the places does not depend on the CPU model.
// A printed module has the same bytes in each process, so the bytes are a gate of the text.
//
//   node bench/growth.ts            measures each shape, and fails on an exponent over its limit
//   node bench/growth.ts <shape>    measures one shape
//   node bench/growth.ts gates      prints the largest size of each shape under the gate of the keys and the gate of names
//
// The gate also reads the source of tier 2 of each shape, with `generate` and `load` in a fresh process (COMPILE.SOURCE.SIZE).
// Its bytes hold. The time of `generate` holds for each shape with a CI read of that time over the floor of its small median.
// The time of `load` is report only (V-089). The parse of its `new Function` grows with the lines times the depth of the blocks.
//
// The parser of the gate of names has a larger stack here than in a test, so that gate reads the largest size of each shape.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GCProfiler } from "node:v8";
import type { Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { env, median } from "../../core/bench/measure.ts";
import { emitModule, withKeyProbe, type KeyProbe } from "../src/module.ts";
import { generate, load } from "../src/tiers.ts";
import { placesOf } from "../src/unshared.ts";
import { keyWatch } from "../test/key-gate.ts";
import { nameFaults } from "../test/names.ts";
import { bytesFlipReadsRed, bytesUnread, exponentsOf, GROWTH_SHAPES, growthFaults, loadExponentOf, sourceVerdict, type GrowthRow, type GrowthShape } from "../test/growth.ts";

/** The processes of each size. */
const SAMPLES = 5;
/** The most milliseconds of one process. */
const LIMIT_MS = 60_000;
/** The stack of the parser of the gate of names, in KB. */
const STACK = "--stack-size=3000";
/** The shape of the read of the depth, and the stack of that read, in KB. The default stack of V8 is 984 KB. */
const DEPTH_SHAPE = "wide";
const LESS_STACK = "--stack-size=492";
const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;

/**
 * This function gives the count of the prints of a child. The count is 1 with no fault.
 * The flip of the gate (`scripts/gate-flip.ts`) sets `GROWTH_FAULT`. Then a child repeats its work and its text once for each 8 levels.
 * So its time and its bytes grow with the square of the levels.
 */
const printsOf = (levels: number): number => (process.env["GROWTH_FAULT"] === "1" ? Math.max(1, Math.floor(levels / 8)) : 1);

/** This function gives a program with no shared object, as a program from JSON has. */
function programOf(shape: GrowthShape, levels: number): Expr {
  return JSON.parse(JSON.stringify(shape.make(levels))) as Expr;
}

/**
 * This function gives the factor of the bytes of a source. The factor is 1 with no fault. The flip of the gate sets `GROWTH_BYTES_FAULT`.
 * Then the bytes at the large size of the shape grow by that factor, and the time and the small size stay.
 */
const bytesFaultOf = (shape: GrowthShape, levels: number): number => (levels === shape.large ? Number(process.env["GROWTH_BYTES_FAULT"] ?? "1") : 1);

/** This function gives the shape of a name. */
function shapeOf(name: string): GrowthShape {
  const shape = GROWTH_SHAPES.find((s) => s.name === name);
  if (shape === undefined) throw new Error(`no shape ${name}`);
  return shape;
}

/** This function prints the count of the faults of the names of a module. */
function names(name: string, levels: number): void {
  const r = emitModule(programOf(shapeOf(name), levels), OPTIONS);
  console.info(r.ok ? nameFaults(r.source).length : -1);
}

/** This function gives the count of the faults of the names of the largest module of a shape, or a negative number with no result. */
function nameCount(shape: GrowthShape): number {
  const r = spawnSync(process.execPath, [STACK, fileURLToPath(import.meta.url), "names", shape.name, String(shape.large)], { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
  return r.status === 0 ? Number(r.stdout.trim().split("\n").at(-1)) : -1;
}

/** This function gives a time in milliseconds, as a text. */
const msOf = (ms: number): string => ms.toFixed(1);

/** This function prints the largest size of a shape under both gates. Its row gives the time of each part of a print under the gates. */
function gated(name: string): void {
  const shape = shapeOf(name);
  const e = programOf(shape, shape.large);
  const start = performance.now();
  const bare = emitModule(e, OPTIONS);
  const bareMs = performance.now() - start;
  const watch = keyWatch();
  let keys = 0;
  let probeMs = 0;
  const timed: KeyProbe = (x, scope, key, table) => {
    const at = performance.now();
    watch.probe(x, scope, key, table);
    probeMs += performance.now() - at;
    keys++;
  };
  const keyedStart = performance.now();
  const keyed = withKeyProbe(timed, () => emitModule(programOf(shape, shape.large), OPTIONS));
  const keyedMs = performance.now() - keyedStart;
  const namesStart = performance.now();
  const found = keyed.ok ? nameFaults(keyed.source).length : -1;
  const namesMs = performance.now() - namesStart;
  const same = bare.ok && keyed.ok && bare.source === keyed.source;
  console.info(JSON.stringify({ bare: msOf(bareMs), keyed: msOf(keyedMs), probe: msOf(probeMs), keys, names: msOf(namesMs), keyFaults: watch.faults.length, nameFaults: found, same }));
}

/** This function reads each shape in a fresh process. It fails on a fault of a gate, on no result or on two texts of one program. */
function gates(): void {
  for (const shape of GROWTH_SHAPES) {
    const r = spawnSync(process.execPath, [STACK, fileURLToPath(import.meta.url), "gated", shape.name], { timeout: 5 * LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8" });
    const line = r.status === 0 ? r.stdout.trim().split("\n").at(-1) : undefined;
    const record = line === undefined ? undefined : (JSON.parse(line) as { readonly keyFaults: number; readonly nameFaults: number; readonly same: boolean });
    const held = record?.keyFaults === 0 && record.nameFaults === 0 && record.same;
    console.info(`${held ? "ok" : "FAIL"} gates ${shape.name} levels=${String(shape.large)} places=${String(placesOf([programOf(shape, shape.large)]))} ${line ?? `exit ${String(r.status)} ${r.stderr.slice(0, 200)}`}`);
    if (!held) process.exitCode = 1;
  }
}

/** This function compiles one program, and it prints its record. */
function child(name: string, levels: number): void {
  const e = programOf(shapeOf(name), levels);
  const prints = printsOf(levels);
  const start = performance.now();
  let r = emitModule(e, OPTIONS);
  for (let i = 1; i < prints; i++) r = emitModule(e, OPTIONS);
  const ms = performance.now() - start;
  console.info(JSON.stringify({ ms, bytes: r.ok ? r.source.length * prints : undefined, reason: r.ok ? undefined : r.reason }));
}

/** This function makes the function of tier 2 of one program, and it prints its record. `ms` is the time of `generate`, and `load` is the time of `load`. */
function sourceChild(name: string, levels: number): void {
  const shape = shapeOf(name);
  const e = programOf(shape, levels);
  const prints = printsOf(levels);
  const collector = new GCProfiler();
  collector.start();
  const start = performance.now();
  let g = generate(e, OPTIONS);
  for (let i = 1; i < prints; i++) g = generate(e, OPTIONS);
  const generated = performance.now();
  if (g.ok) load(g);
  const loaded = performance.now();
  // The cost of a collection is in microseconds. The row prints the sum, so a read can separate the collector from the compile.
  const gc = (collector.stop()?.statistics ?? []).reduce((sum, entry: { readonly cost: number }) => sum + entry.cost, 0) / 1000;
  const bytes = g.ok ? Math.round(g.source.length * prints * bytesFaultOf(shape, levels)) : undefined;
  console.info(JSON.stringify({ ms: generated - start, load: loaded - generated, gc, bytes, reason: g.ok ? undefined : g.reason }));
}

/** The command of a child for each kind of row. */
type Kind = "child" | "source";

/** The record of one process. `load` is the time of `load` in a process of the source. */
interface Sample {
  readonly ms: number;
  readonly load: number | undefined;
  readonly gc: number;
  readonly bytes: number;
}

/** This function gives the record of one process, or `undefined` if the process gave no result. */
function sample(shape: GrowthShape, levels: number, kind: Kind = "child", flags: readonly string[] = []): Sample | undefined {
  const r = spawnSync(process.execPath, [...flags, fileURLToPath(import.meta.url), kind, shape.name, String(levels)], { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
  const line = r.status === 0 ? r.stdout.trim().split("\n").at(-1) : undefined;
  const record = line === undefined ? undefined : (JSON.parse(line) as { readonly ms: number; readonly load?: number; readonly gc?: number; readonly bytes?: number; readonly reason?: string });
  if (record?.bytes !== undefined) return { ms: record.ms, load: record.load, gc: record.gc ?? 0, bytes: record.bytes };
  console.error(`no result: ${shape.name} ${String(levels)} exit ${String(r.status)} ${record?.reason ?? r.stderr.slice(0, 200)}`);
  return undefined;
}

/** This function gives the row of one size of a shape. */
function row(shape: GrowthShape, levels: number, kind: Kind = "child"): GrowthRow {
  const records = Array.from({ length: SAMPLES }, () => sample(shape, levels, kind));
  const done = records.filter((x) => x !== undefined);
  const whole = done.length === SAMPLES;
  const distinct = [...new Set(done.map((x) => x.bytes))];
  const loads = done.map((x) => x.load).filter((x) => x !== undefined);
  const loadMs = whole && loads.length === SAMPLES ? median(loads) : undefined;
  const r: GrowthRow = { shape: shape.name, levels, places: placesOf([programOf(shape, levels)]), ms: whole ? median(done.map((x) => x.ms)) : undefined, loadMs, bytes: whole ? median(done.map((x) => x.bytes)) : undefined, sameBytes: distinct.length <= 1 };
  // A row of the source prints the time of `generate` as `ms`, and the time of `load` as `load`.
  const loadText = kind === "source" ? ` load=${loadMs?.toFixed(1) ?? "none"}` : "";
  console.info(`${kind === "source" ? "source row" : "row"} ${shape.name} levels=${String(levels)} places=${String(r.places)} ms=${r.ms?.toFixed(1) ?? "none"}${loadText} gc=${whole ? median(done.map((x) => x.gc)).toFixed(1) : "none"} bytes=${String(r.bytes)} processes with these bytes=${distinct.length === 1 ? String(done.length) : distinct.join("|")} samples=${done.map((x) => x.ms.toFixed(1)).join(",")}`);
  return r;
}

/** This function measures some shapes, and it fails on a fault of the rule. */
function gate(shapes: readonly GrowthShape[]): void {
  for (const shape of shapes) {
    const small = row(shape, shape.small);
    const large = row(shape, shape.large);
    const found = exponentsOf(small, large);
    const count = nameCount(shape);
    const faults = [...growthFaults(shape, small, large), ...(count === 0 ? [] : [`${shape.name} has ${String(count)} faults of a name at its largest size`])];
    console.info(`${faults.length === 0 ? "ok" : "FAIL"} growth ${shape.name}: time exponent ${found?.time.toFixed(2) ?? "none"}, bytes exponent ${found?.bytes.toFixed(2) ?? "none"}`);
    for (const fault of faults) console.error(`FAIL ${fault}`);
    if (faults.length > 0) process.exitCode = 1;
    sourceGate(shape);
  }
}

/** This function gives the largest level of a shape with a source, in a fresh process for each level. It reads the sizes between the two sizes of the shape. */
function deepestSource(shape: GrowthShape, flags: readonly string[] = []): number {
  let low = shape.small;
  let high = shape.large + 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (sample(shape, middle, "source", flags) === undefined) high = middle;
    else low = middle;
  }
  return low;
}

/**
 * This function reads the source of tier 2 of a shape. It fails on a size with no source, on bytes over the limit and on a limit under the flip of its row.
 * It also fails on a time of `generate` over the `generate` limit of the shape. The time of `load` is report only (V-089).
 */
function sourceGate(shape: GrowthShape): void {
  const small = row(shape, shape.small, "source");
  const large = row(shape, shape.large, "source");
  const found = exponentsOf(small, large);
  const { faults, notes } = sourceVerdict(shape, small, large);
  const flipRed = bytesFlipReadsRed(shape, small, large);
  // Different bytes in the processes of a size read nothing, so the line says no read, and the check shows a warning.
  const unread = bytesUnread(small, large);
  const loadExponent = loadExponentOf(small, large);
  const generateLimit = shape.source.generate === undefined ? "report only" : String(shape.source.generate);
  console.info(
    `${faults.length > 0 || !flipRed ? "FAIL" : unread ? "no read" : "ok"} source ${shape.name}: generate exponent ${found?.time.toFixed(2) ?? "none"}, generate limit ${generateLimit}, load exponent ${loadExponent?.toFixed(2) ?? "none"} (report only), bytes exponent ${found?.bytes.toFixed(3) ?? "none"}, bytes limit ${String(shape.source.bytes)}, bytes ${String(large.bytes)}`,
  );
  for (const note of notes) console.info(`report only: ${note}`);
  if (unread) console.info(`::warning title=Growth: no read::no read of the bytes of the source of ${shape.name} on ${env().cpu}: the processes of a size gave different bytes, so the bytes limit held nothing.`);
  if (!flipRed) {
    console.error(`The bytes limit of ${shape.name} does not find 5 % more bytes at its large size.`);
    process.exitCode = 1;
  }
  // A size with no source gives tier 1 with no message, so the row names the depth (V-092). The default stack holds the
  // largest size of each shape, and the fault fails the gate. A caller can have less stack, so the gate reads a part of it too.
  if (large.bytes === undefined) console.info(`depth ${shape.name}: the last level with a source is ${String(deepestSource(shape))}, and the shape has ${String(shape.large)} levels`);
  if (shape.name === DEPTH_SHAPE) console.info(`depth ${shape.name}: with a stack of ${LESS_STACK.slice(LESS_STACK.indexOf("=") + 1)} KB, the last level with a source is ${String(deepestSource(shape, [LESS_STACK]))}, and the shape has ${String(shape.large)} levels`);
  for (const fault of faults) console.error(`FAIL ${fault}`);
  if (faults.length > 0) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "child") child(rest[0] ?? "", Number(rest[1]));
else if (command === "source") sourceChild(rest[0] ?? "", Number(rest[1]));
else if (command === "names") names(rest[0] ?? "", Number(rest[1]));
else if (command === "gated") gated(rest[0] ?? "");
else if (command === "gates") gates();
else gate(command === undefined ? GROWTH_SHAPES : [shapeOf(command)]);
