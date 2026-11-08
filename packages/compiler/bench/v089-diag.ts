// A diagnostic of V-089 for CI only: the time of each phase of the source of tier 2, and the time of the load of some
// forms of the same source. Each sample is a fresh process. This file is not for main.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GCProfiler } from "node:v8";
import { monotoneError, sizeError, stepError, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { factsOf } from "../src/facts.ts";
import { printJs } from "../src/js.ts";
import { lower } from "../src/lower.ts";
import { createRuntime } from "../src/runtime.ts";
import { placesOf } from "../src/unshared.ts";
import { GROWTH_SHAPES } from "../test/growth.ts";

const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;
const SAMPLES = 5;
const SHAPES = (process.env["DIAG_SHAPES"] ?? "wide,wideloop,constlet,chain,letchain").split(",");

const shapeOf = (name: string) => {
  const s = GROWTH_SHAPES.find((x) => x.name === name);
  if (s === undefined) throw new Error(name);
  return s;
};

/** The forms of the source. Each form keeps the syntax valid, and only the load reads it. */
function noCatch(src: string): string {
  return src.replaceAll("catch (e) {", "catch {").replaceAll("(e)", "(0)").replaceAll("(e, ", "(0, ");
}
function noLabel(src: string): string {
  const body = src
    .replaceAll(/^[LS]\d+: /gm, "")
    .replaceAll(/break [LS]\d+;/g, "break;")
    .replaceAll(/continue L\d+;/g, "continue;");
  // A break with no label needs a loop around it.
  const at = body.indexOf("\ntry {\n");
  const end = body.lastIndexOf("} catch {\nreturn F;\n}\n};");
  return `${body.slice(0, at)}\nfor (;;) {\ntry {\n${body.slice(at + 7, end)}} catch {\nreturn F;\n}\n}\n};${body.slice(end + "} catch {\nreturn F;\n}\n};".length)}`;
}
/** The form with each block of one line: the same text with no line breaks. */
function oneLine(src: string): string {
  return src.replaceAll(/ \/\/ [^\n]*/g, "").replaceAll("\n", " ");
}

function timed<T>(f: () => T): { value: T; ms: number; gc: number } {
  const p = new GCProfiler();
  p.start();
  const start = performance.now();
  const value = f();
  const ms = performance.now() - start;
  const gc = (p.stop()?.statistics ?? []).reduce((sum, entry: { readonly cost: number }) => sum + entry.cost, 0) / 1000;
  return { value, ms, gc };
}

function child(name: string, levels: number): void {
  const e = JSON.parse(JSON.stringify(shapeOf(name).make(levels))) as Expr;
  const out: Record<string, number> = {};
  const facts = factsOf(OPTIONS);
  const lowered = timed(() => lower(e, facts, OPTIONS.schema));
  out["lower"] = lowered.ms;
  out["lower.gc"] = lowered.gc;
  const checks = timed(() => [sizeError(e, OPTIONS), stepError(e, OPTIONS), monotoneError(e, OPTIONS)]);
  out["checks"] = checks.ms;
  const printed = timed(() => printJs(lowered.value, facts));
  out["print"] = printed.ms;
  out["print.gc"] = printed.gc;
  const src = printed.value;
  out["bytes"] = src.length;
  const runtime = createRuntime(OPTIONS);
  const forms: Record<string, string> = { load: src, nocatch: noCatch(src), nolabel: noLabel(src), both: noLabel(noCatch(src)), oneline: oneLine(src) };
  for (const [form, text] of Object.entries(forms)) {
    try {
      // oxlint-disable-next-line typescript/no-implied-eval -- a diagnostic of the parse of the source
      const r = timed(() => (new Function("K", "R", text) as (k: readonly unknown[], r: unknown) => unknown)(lowered.value.constants, runtime));
      out[form] = r.ms;
      out[`${form}.gc`] = r.gc;
    } catch (thrown) {
      console.error(`${form}: ${String(thrown).slice(0, 200)}`);
      out[form] = Number.NaN;
    }
  }
  console.info(JSON.stringify(out));
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};

function row(name: string, levels: number): Record<string, number> {
  const records: Record<string, number>[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "child", name, String(levels)], { timeout: 180_000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1 << 20 });
    if (r.stderr.trim() !== "") console.error(r.stderr.slice(0, 400));
    const line = r.status === 0 ? r.stdout.trim().split("\n").at(-1) : undefined;
    if (line !== undefined) records.push(JSON.parse(line) as Record<string, number>);
  }
  const keys = Object.keys(records[0] ?? {});
  return Object.fromEntries(keys.map((k) => [k, median(records.map((x) => x[k] as number))]));
}

function main(): void {
  for (const name of SHAPES) {
    const shape = shapeOf(name);
    const small = row(name, shape.small);
    const large = row(name, shape.large);
    const ps = placesOf([shape.make(shape.small)]);
    const pl = placesOf([shape.make(shape.large)]);
    const ratio = (large["bytes"] as number) / (small["bytes"] as number);
    console.info(`diag ${name} places ${String(ps)} ${String(pl)} bytes ${String(small["bytes"])} ${String(large["bytes"])}`);
    for (const k of Object.keys(large)) {
      const a = small[k] as number;
      const b = large[k] as number;
      const ex = Math.log(b / a) / Math.log(pl / ps);
      console.info(`diag ${name} ${k.padEnd(12)} small ${a.toFixed(1).padStart(9)} large ${b.toFixed(1).padStart(9)} exponent ${ex.toFixed(2)} extra ${(b - a * ratio).toFixed(1)}`);
    }
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === "child") child(rest[0] ?? "", Number(rest[1]));
else main();
