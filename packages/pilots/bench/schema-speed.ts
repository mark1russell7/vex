/**
 * The speed of the schema pilot (EXAMPLE.SCHEMA), for the speed job of the nightly workflow. Graph needs 5 ms or less
 * for one sample of 20 documents of 30 fields.
 *
 * Start it from the repo root with `node packages/pilots/bench/schema-speed.ts`. It needs Node 24 or later, for the
 * type stripping. It prints one line for each case. With `BENCH_OUT=<file>`, it also writes the records as JSON.
 *
 * Each case runs `RUNS` times (default 40) after `WARM` runs (default 10). Thus the numbers are of the warm interpreter,
 * as in Graph after its first samples. `COLD=1` adds two cold cases: the first run of the pilot in the process, and
 * the case of `schema.test.ts`, the mean of 5 runs after one.
 *
 * The script fails (exit 1) when a result is not the same as the result of the copy of `inferSchema` of Graph. The
 * time does not make it fail.
 */
import { writeFileSync } from "node:fs";
import { app, axes, call, compile, each, evaluate, fn, fold, let_, lit, rec, space, v, vexList, type Expr, type ItemNames, type Result } from "@mark1russell7/vex";
import { SCHEMA_DOMAINS, SCHEMA_PROGRAM } from "../src/schema.ts";

const RUNS = Number(process.env["RUNS"] ?? 40);
const WARM = Number(process.env["WARM"] ?? 10);

/** One record of the schema: a path, its kinds and the count of its documents. */
interface Row {
  readonly path: string;
  readonly kinds: readonly string[];
  readonly count: number;
}

// The reference of Graph (stage-schema.ts), as in schema.test.ts.
const isRec = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null && !Array.isArray(u);

function valueKind(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    const items = [...new Set((value as readonly unknown[]).map((x) => (Array.isArray(x) ? "array" : valueKind(x))))];
    return items.length > 0 ? `array<${items.join("|")}>` : "array";
  }
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" ? t : t === "object" ? "object" : "string";
}

function inferSchema(input: readonly unknown[]): readonly Row[] {
  const fields = new Map<string, { kinds: Set<string>; docs: Set<number> }>();
  const addNote = (p: string, k: string, d: number): void => {
    let f = fields.get(p);
    if (f === undefined) {
      f = { kinds: new Set(), docs: new Set() };
      fields.set(p, f);
    }
    f.kinds.add(k);
    f.docs.add(d);
  };
  const walk = (val: Readonly<Record<string, unknown>>, prefix: string, depth: number, doc: number): void => {
    for (const [key, x] of Object.entries(val)) {
      const p = prefix === "" ? key : `${prefix}.${key}`;
      if (isRec(x) && Object.keys(x).length > 0 && depth < 3) walk(x, p, depth + 1, doc);
      else addNote(p, valueKind(x), doc);
    }
  };
  input.forEach((d, i) => {
    if (isRec(d)) walk(d, "", 1, i);
  });
  return [...fields].map(([path, f]) => ({ path, kinds: [...f.kinds], count: f.docs.size }));
}

// The input of the speed case of schema.test.ts: 20 documents of 30 fields.
const docs = Array.from({ length: 20 }, (_doc, d) => Object.fromEntries(Array.from({ length: 30 }, (_field, f) => [`f${String(f)}`, f % 3 === 0 ? { a: { b: [d, "x"] } } : f % 3 === 1 ? d : [d, null]])));

// A copy of the pilot program, cut into stages, and the rewrite (c) with the ops that exist.
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
const has = (list: Expr, x: Expr): Expr => app("ifError", app("gte", app("indexOf", list, x), lit(0)), lit(false));
const upd = let_(
  { old: app("nth", v("rows"), v("j")) },
  rec({
    path: field(v("old"), "path"),
    kinds: app("if", has(field(v("old"), "kinds"), field(v("n"), "kind")), field(v("old"), "kinds"), app("append", field(v("old"), "kinds"), one(field(v("n"), "kind")))),
    count: app("if", app("eq", field(v("old"), "last"), field(v("n"), "doc")), field(v("old"), "count"), app("add", field(v("old"), "count"), lit(1))),
    last: field(v("n"), "doc"),
  }),
);
const newRow = rec({ path: field(v("n"), "path"), kinds: one(field(v("n"), "kind")), count: lit(1), last: field(v("n"), "doc") });
const table = fold(
  axes.list(v("notes")),
  { paths: EMPTY, rows: EMPTY },
  {
    paths: app("if", has(v("paths"), field(v("n"), "path")), v("paths"), app("append", v("paths"), one(field(v("n"), "path")))),
    rows: let_({ j: app("ifError", app("indexOf", v("paths"), field(v("n"), "path")), lit(-1)) }, app("if", app("lt", v("j"), lit(0)), app("append", v("rows"), one(newRow)), app("append", app("append", app("take", v("rows"), v("j")), one(upd)), app("drop", v("rows"), app("add", v("j"), lit(1)))))),
  },
  v("rows"),
  undefined,
  ["n"],
);

const opts = { space: space.array([{}]), origin: "0", domains: SCHEMA_DOMAINS, vars: { docs } };
const want = JSON.stringify(inferSchema(docs));

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
  "stage: walk only": wrap(app("count", v("notes"))),
  "stage: walk + distinct paths": wrap(app("count", paths)),
  "stage: walk + paths + filter per path": wrap(let_({ paths }, app("values", loop(v("paths"), ["p"], app("count", mine))))),
  "rewrite (c): one fold": wrap(app("values", loop(table, ["r"], rec({ path: field(v("r"), "path"), kinds: app("values", field(v("r"), "kinds")), count: field(v("r"), "count") })))),
};
const cases: Record<string, () => unknown> = Object.fromEntries(Object.entries(exprs).map(([name, e]) => [name, () => evaluate(e, opts)]));
cases["compile alone"] = () => compile(SCHEMA_PROGRAM, { domains: SCHEMA_DOMAINS });
cases["TypeScript inferSchema"] = () => inferSchema(docs);
// The cases that must give the records of inferSchema.
const SAME = new Set(["pilot (evaluate)", "rewrite (c): one fold", "TypeScript inferSchema"]);

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
  // The first run of the pilot in this process, before any other evaluation: the time of Graph at a page open.
  const t1 = performance.now();
  const first = evaluate(SCHEMA_PROGRAM, opts);
  out.push({ name: "cold: first run of the pilot", median: performance.now() - t1, min: Number.NaN, p90: Number.NaN, check: checkOf(first, true) });
  // The case of schema.test.ts: one run, then the mean of 5 runs.
  const fresh = wrap(let_({ paths }, app("values", loop(v("paths"), ["p"], rec({ path: v("p"), kinds: app("values", call("distinct", loop(mine, ["n"], field(v("n"), "kind")))), count: app("count", call("distinct", loop(mine, ["n"], field(v("n"), "doc")))) })))));
  evaluate(fresh, opts);
  const t0 = performance.now();
  let last: Result<unknown> | undefined;
  for (let i = 0; i < 5; i++) last = evaluate(fresh, opts);
  const median = (performance.now() - t0) / 5;
  out.push({ name: "cold: mean of 5 runs after 1", median, min: Number.NaN, p90: Number.NaN, check: checkOf(last, true) });
}
for (const [name, run] of Object.entries(cases)) {
  // A case of SAME gives the records of Graph. A stage gives a count, and an error of a stage fails too.
  const check = checkOf(run(), SAME.has(name));
  for (let i = 0; i < WARM; i++) run();
  const ts: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    run();
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  const at = (q: number): number => ts[Math.floor(ts.length * q)] ?? Number.NaN;
  out.push({ name, median: at(0.5), min: at(0), p90: at(0.9), check });
}
const pilot = out.find((o) => o.name === "pilot (evaluate)")?.median ?? Number.NaN;
for (const o of out) {
  console.info(`${o.name.padEnd(40)} median ${o.median.toFixed(2).padStart(8)} ms  min ${o.min.toFixed(2).padStart(8)}  share of the pilot ${((100 * o.median) / pilot).toFixed(0).padStart(4)} %  same as Graph: ${o.check}`);
}
console.info(`target: 5 ms for one sample. The warm pilot needs a factor of ${(pilot / 5).toFixed(1)} on this machine.`);
const file = process.env["BENCH_OUT"];
if (file !== undefined && file !== "") writeFileSync(file, JSON.stringify({ node: process.version, runs: RUNS, warm: WARM, cases: out }, null, 2));
// A result that is not the result of Graph fails the step. The numbers stay in the report.
const wrong = out.filter((o) => o.check !== "true" && o.check !== "n/a");
if (wrong.length > 0) {
  console.error(`not the same as inferSchema of Graph: ${wrong.map((o) => `${o.name} (${o.check})`).join(", ")}`);
  process.exitCode = 1;
}
