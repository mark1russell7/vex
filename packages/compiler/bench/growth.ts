// The gate of the growth of a compile (COMPILE.GROWTH). A fresh process compiles each shape at two sizes, and the gate reads
// the median time and the bytes of the module. The exponent of each against the places does not depend on the CPU model.
// A printed module has the same bytes in each process, so the bytes are a gate of the text.
//
//   node bench/growth.ts            measures each shape, and fails on an exponent over its limit
//   node bench/growth.ts <shape>    measures one shape
//
// The parser of the gate of names has a larger stack here than in a test, so that gate reads the largest size of each shape.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { median } from "../../core/bench/measure.ts";
import { emitModule } from "../src/module.ts";
import { placesOf } from "../src/unshared.ts";
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
else gate(command === undefined ? GROWTH_SHAPES : [shapeOf(command)]);
