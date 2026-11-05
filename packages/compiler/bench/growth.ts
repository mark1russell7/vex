// The gate of the growth of a compile (COMPILE.GROWTH). A fresh process compiles each shape at two sizes, and the gate reads
// the median time and the bytes of the module. The exponent of each against the places does not depend on the CPU model.
// A printed module has the same bytes in each process, so the bytes are a gate of the text.
//
//   node bench/growth.ts            measures each shape, and fails on an exponent over its limit
//   node bench/growth.ts <shape>    measures one shape
//   node bench/growth.ts gates      prints the largest size of each shape under the gate of the keys and the gate of names
//
// The parser of the gate of names has a larger stack here than in a test, so that gate reads the largest size of each shape.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { median } from "../../core/bench/measure.ts";
import { emitModule, withKeyProbe, type KeyProbe } from "../src/module.ts";
import { placesOf } from "../src/unshared.ts";
import { keyWatch } from "../test/key-gate.ts";
import { nameFaults } from "../test/names.ts";
import { exponentsOf, GROWTH_SHAPES, growthFaults, type GrowthRow, type GrowthShape } from "../test/growth.ts";

/** The processes of each size. */
const SAMPLES = 5;
/** The most milliseconds of one process. */
const LIMIT_MS = 60_000;
/** The stack of the parser of the gate of names, in KB. */
const STACK = "--stack-size=3000";
const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;

/** This function gives a program with no shared object, as a program from JSON has. */
function programOf(shape: GrowthShape, levels: number): Expr {
  return JSON.parse(JSON.stringify(shape.make(levels))) as Expr;
}

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
  const start = performance.now();
  const r = emitModule(e, OPTIONS);
  const ms = performance.now() - start;
  console.info(JSON.stringify({ ms, bytes: r.ok ? r.source.length : undefined, reason: r.ok ? undefined : r.reason }));
}

/** This function gives the record of one process, or `undefined` if the process gave no result. */
function sample(shape: GrowthShape, levels: number): { readonly ms: number; readonly bytes: number } | undefined {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "child", shape.name, String(levels)], { timeout: LIMIT_MS, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
  const line = r.status === 0 ? r.stdout.trim().split("\n").at(-1) : undefined;
  const record = line === undefined ? undefined : (JSON.parse(line) as { readonly ms: number; readonly bytes?: number; readonly reason?: string });
  if (record?.bytes !== undefined) return { ms: record.ms, bytes: record.bytes };
  console.error(`no result: ${shape.name} ${String(levels)} exit ${String(r.status)} ${record?.reason ?? r.stderr.slice(0, 200)}`);
  return undefined;
}

/** This function gives the row of one size of a shape. */
function row(shape: GrowthShape, levels: number): GrowthRow {
  const records = Array.from({ length: SAMPLES }, () => sample(shape, levels));
  const done = records.filter((x) => x !== undefined);
  const whole = done.length === SAMPLES;
  const r: GrowthRow = { shape: shape.name, levels, places: placesOf([programOf(shape, levels)]), ms: whole ? median(done.map((x) => x.ms)) : undefined, bytes: whole ? median(done.map((x) => x.bytes)) : undefined };
  console.info(`row ${shape.name} levels=${String(levels)} places=${String(r.places)} ms=${r.ms?.toFixed(1) ?? "none"} bytes=${String(r.bytes)} samples=${done.map((x) => x.ms.toFixed(1)).join(",")}`);
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
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === "child") child(rest[0] ?? "", Number(rest[1]));
else if (command === "names") names(rest[0] ?? "", Number(rest[1]));
else if (command === "gated") gated(rest[0] ?? "");
else if (command === "gates") gates();
else gate(command === undefined ? GROWTH_SHAPES : [shapeOf(command)]);
