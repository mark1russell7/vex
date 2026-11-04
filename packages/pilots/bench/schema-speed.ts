/**
 * The speed of the schema pilot (EXAMPLE.SCHEMA), for the speed job of the nightly workflow. The target is 5 ms or less
 * for one sample of 20 documents of 30 fields.
 *
 * Start it from the repo root with `node packages/pilots/bench/schema-speed.ts`. It needs Node 24 or later, for the
 * type stripping. It prints one line for each case. With `BENCH_OUT=<file>`, it also writes the records as JSON.
 *
 * Each case runs `RUNS` times (default 40) after `WARM` runs (default 10). Thus the numbers are of the warm interpreter,
 * as in a host after its first samples. `COLD=1` adds the cold case of `schema.test.ts`: the mean of 5 runs after one.
 * `schema-cold.ts` measures the first sample in new processes.
 *
 * Two cases are references in the same run: `TypeScript reference` and `calibration`, a fixed JavaScript work of
 * Map, filter and object steps. Each line gives the ratio of its median to the median of `calibration`. The runners of
 * CI differ by up to 1.4x, and the ratio removes most of that difference. `README.md` tells how to read the numbers.
 *
 * On 2026-11-04 the code of `TypeScript reference` changed, so do not compare its time or a ratio to it across this date.
 * Each record gives this date in `referenceSince`.
 *
 * The script fails (exit 1) when a result is not the same as the result of `schemaReference`. The time does
 * not make it fail.
 */
import { writeFileSync } from "node:fs";
import { app, axes, call, compile, each, evaluate, fn, fold, let_, lit, rec, space, v, vexList, type Expr, type ItemNames, type Result } from "@mark1russell7/vex";
import { schemaReference } from "../src/schema-reference.ts";
import { SCHEMA_DOMAINS, SCHEMA_PROGRAM } from "../src/schema.ts";
import { context, env, envLine } from "../../core/bench/measure.ts";

const RUNS = Number(process.env["RUNS"] ?? 40);
const WARM = Number(process.env["WARM"] ?? 10);

// The input of the speed case of schema.test.ts: 20 documents of 30 fields.
const docs = Array.from({ length: 20 }, (_doc, d) => Object.fromEntries(Array.from({ length: 30 }, (_field, f) => [`f${String(f)}`, f % 3 === 0 ? { a: { b: [d, "x"] } } : f % 3 === 1 ? d : [d, null]])));

// A copy of the pilot program before the list ops `distinct`, `group`, `join` and the op `leaves` (v1), cut into stages.
const EMPTY = lit(vexList([]));
const loop = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.list(list), body, undefined, as);
const one = (x: Expr): Expr => app("fill", lit(1), x);
const text = (first: Expr, ...parts: readonly Expr[]): Expr => parts.reduce((a, b) => app("concat", a, b), first);
const field = (o: Expr, k: string | Expr): Expr => app("field", o, typeof k === "string" ? lit(k) : k);
const distinct = fn(["xs"], fold(axes.list(v("xs")), { acc: EMPTY }, { acc: app("if", app("ifError", app("gte", app("indexOf", v("acc"), v("x")), lit(0)), lit(false)), v("acc"), app("append", v("acc"), one(v("x")))) }, v("acc"), undefined, ["x"]));
const joinBar = fn(["ks"], fold(axes.list(v("ks")), { s: lit("") }, { s: app("if", app("eq", v("i"), lit(0)), v("k"), text(v("s"), lit("|"), v("k"))) }, v("s"), undefined, ["k", "i"]));
const arrayKind = fn(["a"], let_({ ks: call("distinct", app("kinds", v("a"))) }, app("if", app("eq", app("count", v("ks")), lit(0)), lit("array"), text(lit("array<"), call("joinBar", v("ks")), lit(">")))));
const note = fn(["p", "kd", "o", "k"], one(rec({ path: v("p"), kind: app("if", app("eq", v("kd"), lit("array")), call("arrayKind", field(v("o"), v("k"))), v("kd")) })));

function level(inner: string | undefined): Expr {
  const here = call("note", v("p"), v("kd"), v("o"), v("k"));
  const deeper = inner === undefined ? here : app("if", app("and", app("eq", v("kd"), lit("object")), app("gt", app("count", app("fields", field(v("o"), v("k")))), lit(0))), call(inner, field(v("o"), v("k")), v("p")), here);
  const path = app("if", app("eq", v("prefix"), lit("")), v("k"), text(v("prefix"), lit("."), v("k")));
  return fn(["o", "prefix"], let_({ ks: app("kinds", v("o")) }, app("flat", loop(app("fields", v("o")), ["k", "i"], let_({ p: path, kd: app("nth", v("ks"), v("i")) }, deeper)))));
}

const notes = app("flat", loop(v("docs"), ["d", "i"], loop(app("if", app("ifError", app("eq", app("kind", v("d")), lit("object")), lit(false)), call("level1", v("d"), lit("")), EMPTY), ["n"], rec({ path: field(v("n"), "path"), kind: field(v("n"), "kind"), doc: v("i") }))));
const paths = call("distinct", loop(v("notes"), ["n"], field(v("n"), "path")));
const mine = app("flat", loop(v("notes"), ["n"], app("if", app("eq", field(v("n"), "path"), v("p")), one(v("n")), EMPTY)));
const wrap = (body: Expr): Expr => let_({ distinct, joinBar }, let_({ arrayKind }, let_({ note }, let_({ level3: level(undefined) }, let_({ level2: level("level3") }, let_({ level1: level("level2") }, let_({ notes }, body)))))));
const v1 = wrap(let_({ paths }, app("values", loop(v("paths"), ["p"], rec({ path: v("p"), kinds: app("values", call("distinct", loop(mine, ["n"], field(v("n"), "kind")))), count: app("count", call("distinct", loop(mine, ["n"], field(v("n"), "doc")))) })))));
const opts = { space: space.array([{}]), origin: "0", domains: SCHEMA_DOMAINS, vars: { docs } };
const want = JSON.stringify(schemaReference(docs));

/** This function tells if a value is a result of `evaluate`. */
const isResult = (r: unknown): r is Result<unknown> => typeof r === "object" && r !== null && "ok" in r;

/** This function gives the check of a result: `true`, `false`, or the code of an error. */
function checkOf(r: unknown, same: boolean): string {
  if (isResult(r)) {
    if (!r.ok) return `error ${r.error.code}`;
    return same ? String(JSON.stringify(r.value) === want) : "n/a";
  }
  return same ? String(JSON.stringify(r) === want) : "n/a";
}

// Each expression is built one time, so each run hits the cache of compiled programs of evaluate.
const exprs: Readonly<Record<string, Expr>> = {
  "pilot (evaluate)": SCHEMA_PROGRAM,
  "pilot v1 (functions of the walk)": v1,
  "stage: walk only": wrap(app("count", v("notes"))),
  "stage: walk + distinct paths": wrap(app("count", paths)),
  "stage: walk + paths + filter per path": wrap(let_({ paths }, app("values", loop(v("paths"), ["p"], app("count", mine))))),
};
const cases: Record<string, () => unknown> = Object.fromEntries(Object.entries(exprs).map(([name, e]) => [name, () => evaluate(e, opts)]));
cases["compile alone"] = () => compile(SCHEMA_PROGRAM, { domains: SCHEMA_DOMAINS });
cases["TypeScript reference"] = () => schemaReference(docs);
// A fixed work of plain JavaScript, of the kinds of steps of the interpreter. Its time follows the speed of the runner.
const CAL_ITEMS = Object.freeze(Array.from({ length: 600 }, (_x, i) => Object.freeze({ k: `p${String(i % 30)}`, n: i })));
cases["calibration"] = () => {
  let size = 0;
  for (let r = 0; r < 1200; r++) {
    const seen = new Map<string, number>();
    for (const x of CAL_ITEMS.filter((y) => y.n % 2 === r % 2)) seen.set(x.k, (seen.get(x.k) ?? 0) + x.n);
    size += seen.size;
  }
  return size;
};
// The cases that must give the records of schemaReference.
const SAME = new Set(["pilot (evaluate)", "pilot v1 (functions of the walk)", "TypeScript reference"]);

/** The record of one case: the times in ms, and the check of its result. */
interface Measure {
  readonly name: string;
  readonly median: number;
  readonly min: number;
  readonly p90: number;
  readonly check: string;
}

const out: Measure[] = [];
if (process.env["COLD"] === "1") {
  // The case of schema.test.ts: one run, then the mean of 5 runs.
  const fresh = { ...SCHEMA_PROGRAM };
  evaluate(fresh, opts);
  const t0 = performance.now();
  let last: Result<unknown> | undefined;
  for (let i = 0; i < 5; i++) last = evaluate(fresh, opts);
  const median = (performance.now() - t0) / 5;
  out.push({ name: "cold: mean of 5 runs after 1", median, min: Number.NaN, p90: Number.NaN, check: checkOf(last, true) });
}
// The cases alternate in this process: each run times each case one time, and the order of the cases turns by one
// place at each run. Thus no case has a better place in the warm-up of the machine (core/bench/measure.ts).
const entries = Object.entries(cases);
const checks = new Map(entries.map(([name, run]) => [name, checkOf(run(), SAME.has(name))]));
for (let i = 0; i < WARM; i++) for (const [, run] of entries) run();
const times = new Map<string, number[]>(entries.map(([name]) => [name, []]));
for (let i = 0; i < RUNS; i++) {
  for (let k = 0; k < entries.length; k++) {
    const [name, run] = entries[(i + k) % entries.length] ?? ["", (): unknown => undefined];
    const t0 = performance.now();
    run();
    times.get(name)?.push(performance.now() - t0);
  }
}
for (const [name] of entries) {
  // A case of SAME gives the records of the reference. A stage gives a count, and an error of a stage fails too.
  const ts = [...(times.get(name) ?? [])];
  // oxlint-disable-next-line unicorn/no-array-sort
  ts.sort((a, b) => a - b);
  const at = (q: number): number => ts[Math.floor(ts.length * q)] ?? Number.NaN;
  out.push({ name, median: at(0.5), min: at(0), p90: at(0.9), check: checks.get(name) ?? "missing" });
}
console.info(envLine("process"));
const pilot = out.find((o) => o.name === "pilot (evaluate)")?.median ?? Number.NaN;
const cal = out.find((o) => o.name === "calibration")?.median ?? Number.NaN;
const ts = out.find((o) => o.name === "TypeScript reference")?.median ?? Number.NaN;
for (const o of out) {
  console.info(`${o.name.padEnd(40)} median ${o.median.toFixed(2).padStart(8)} ms  min ${o.min.toFixed(2).padStart(8)}  share of the pilot ${((100 * o.median) / pilot).toFixed(0).padStart(4)} %  per calibration ${(o.median / cal).toFixed(3).padStart(7)}  per TypeScript ${(o.median / ts).toFixed(1).padStart(7)}  same as the reference: ${o.check}`);
}
console.info(`target: 5 ms for one sample, ${(5 / cal).toFixed(3)} per calibration. The warm pilot needs a factor of ${(pilot / 5).toFixed(1)} on this runner.`);
const file = process.env["BENCH_OUT"];
if (file !== undefined && file !== "") writeFileSync(file, JSON.stringify({ mode: "process", referenceSince: "2026-11-04", context: context(), env: env(), node: process.version, runs: RUNS, warm: WARM, calibration: cal, cases: out }, null, 2));
// A result that is not the result of the reference fails the step. The numbers stay in the report.
const wrong = out.filter((o) => o.check !== "true" && o.check !== "n/a");
if (wrong.length > 0) {
  console.error(`not the same as the reference: ${wrong.map((o) => `${o.name} (${o.check})`).join(", ")}`);
  process.exitCode = 1;
}
