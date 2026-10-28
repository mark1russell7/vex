// The speed of the schema pilot (EXAMPLE.SCHEMA), for the speed job of the nightly workflow. Graph needs 5 ms or
// less for one sample of 20 documents of 30 fields.
//
// Start it from the repo root with `node packages/pilots/bench/schema-speed.mjs`. It needs Node 24 or later, for the
// type stripping. The variable VEX_ROOT names another checkout to measure. It prints one line for each case. With
// BENCH_OUT=<file>, it also writes the records as JSON.
//
// Each case runs RUNS times (default 40) after WARM runs (default 10). Thus the numbers are of the warm interpreter,
// as in Graph after its first samples. COLD=1 adds the cold case of schema.test.ts: the mean of 5 runs after one run.
//
// The script fails (exit 1) when a result is not the same as the result of the copy of `inferSchema` of Graph. The
// time does not make it fail.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(process.env.VEX_ROOT ?? fileURLToPath(new URL("../../..", import.meta.url)));
const src = (p) => import(pathToFileURL(resolve(root, p)).href);
const { app, axes, call, each, fn, fold, let_, lit, rec, v, vexList, evaluate, compile, space } = await src("packages/core/src/index.ts");
const { SCHEMA_PROGRAM, SCHEMA_DOMAINS } = await src("packages/pilots/src/schema.ts");
const RUNS = Number(process.env.RUNS ?? 40);
const WARM = Number(process.env.WARM ?? 10);

// The reference of Graph (stage-schema.ts), as in schema.test.ts.
const isRec = (u) => !!u && typeof u === "object" && !Array.isArray(u);
function valueKind(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    const items = [...new Set(value.map((x) => (Array.isArray(x) ? "array" : valueKind(x))))];
    return items.length > 0 ? `array<${items.join("|")}>` : "array";
  }
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" ? t : t === "object" ? "object" : "string";
}
function inferSchema(docs) {
  const fields = new Map();
  const note = (p, k, d) => {
    let f = fields.get(p);
    if (!f) fields.set(p, (f = { kinds: new Set(), docs: new Set() }));
    f.kinds.add(k);
    f.docs.add(d);
  };
  const walk = (val, prefix, depth, doc) => {
    for (const [key, x] of Object.entries(val)) {
      const p = prefix ? `${prefix}.${key}` : key;
      if (isRec(x) && Object.keys(x).length && depth < 3) walk(x, p, depth + 1, doc);
      else note(p, valueKind(x), doc);
    }
  };
  docs.forEach((d, i) => {
    if (isRec(d)) walk(d, "", 1, i);
  });
  return [...fields].map(([path, f]) => ({ path, kinds: [...f.kinds], count: f.docs.size }));
}

// The input of the speed case of schema.test.ts: 20 documents of 30 fields.
const docs = Array.from({ length: 20 }, (_doc, d) => Object.fromEntries(Array.from({ length: 30 }, (_field, f) => [`f${f}`, f % 3 === 0 ? { a: { b: [d, "x"] } } : f % 3 === 1 ? d : [d, null]])));

// A copy of the pilot program, cut into stages, and the rewrite (c) with the ops that exist.
const EMPTY = lit(vexList([]));
const loop = (list, as, body) => each(axes.list(list), body, undefined, as);
const one = (x) => app("fill", lit(1), x);
const text = (...parts) => parts.reduce((a, b) => app("concat", a, b));
const field = (o, k) => app("field", o, typeof k === "string" ? lit(k) : k);
const distinct = fn(["xs"], fold(axes.list(v("xs")), { acc: EMPTY }, { acc: app("if", app("ifError", app("gte", app("indexOf", v("acc"), v("x")), lit(0)), lit(false)), v("acc"), app("append", v("acc"), one(v("x")))) }, v("acc"), undefined, ["x"]));
const joinBar = fn(["ks"], fold(axes.list(v("ks")), { s: lit("") }, { s: app("if", app("eq", v("i"), lit(0)), v("k"), text(v("s"), lit("|"), v("k"))) }, v("s"), undefined, ["k", "i"]));
const arrayKind = fn(["a"], let_({ ks: call("distinct", app("kinds", v("a"))) }, app("if", app("eq", app("count", v("ks")), lit(0)), lit("array"), text(lit("array<"), call("joinBar", v("ks")), lit(">")))));
const note = fn(["p", "kd", "o", "k"], one(rec({ path: v("p"), kind: app("if", app("eq", v("kd"), lit("array")), call("arrayKind", field(v("o"), v("k"))), v("kd")) })));
function level(inner) {
  const here = call("note", v("p"), v("kd"), v("o"), v("k"));
  const deeper = inner === undefined ? here : app("if", app("and", app("eq", v("kd"), lit("object")), app("gt", app("count", app("fields", field(v("o"), v("k")))), lit(0))), call(inner, field(v("o"), v("k")), v("p")), here);
  const path = app("if", app("eq", v("prefix"), lit("")), v("k"), text(v("prefix"), lit("."), v("k")));
  return fn(["o", "prefix"], let_({ ks: app("kinds", v("o")) }, app("flat", loop(app("fields", v("o")), ["k", "i"], let_({ p: path, kd: app("nth", v("ks"), v("i")) }, deeper)))));
}
const notes = app("flat", loop(v("docs"), ["d", "i"], loop(app("if", app("ifError", app("eq", app("kind", v("d")), lit("object")), lit(false)), call("level1", v("d"), lit("")), EMPTY), ["n"], rec({ path: field(v("n"), "path"), kind: field(v("n"), "kind"), doc: v("i") }))));
const paths = call("distinct", loop(v("notes"), ["n"], field(v("n"), "path")));
const mine = app("flat", loop(v("notes"), ["n"], app("if", app("eq", field(v("n"), "path"), v("p")), one(v("n")), EMPTY)));
const wrap = (body) => let_({ distinct, joinBar }, let_({ arrayKind }, let_({ note }, let_({ level3: level(undefined) }, let_({ level2: level("level3") }, let_({ level1: level("level2") }, let_({ notes }, body)))))));
const has = (list, x) => app("ifError", app("gte", app("indexOf", list, x), lit(0)), lit(false));
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
// Each expression is built one time, so each run hits the cache of compiled programs of evaluate.
const exprs = {
  "pilot (evaluate)": SCHEMA_PROGRAM,
  "stage: walk only": wrap(app("count", v("notes"))),
  "stage: walk + distinct paths": wrap(app("count", paths)),
  "stage: walk + paths + filter per path": wrap(let_({ paths }, app("values", loop(v("paths"), ["p"], app("count", mine))))),
  "rewrite (c): one fold": wrap(app("values", loop(table, ["r"], rec({ path: field(v("r"), "path"), kinds: app("values", field(v("r"), "kinds")), count: field(v("r"), "count") })))),
};
const cases = Object.fromEntries(Object.entries(exprs).map(([name, e]) => [name, () => evaluate(e, opts)]));
cases["compile alone"] = () => compile(SCHEMA_PROGRAM, { domains: SCHEMA_DOMAINS });
cases["TypeScript inferSchema"] = () => inferSchema(docs);
// The cases that must give the records of inferSchema.
const SAME = new Set(["pilot (evaluate)", "rewrite (c): one fold", "TypeScript inferSchema"]);

const out = [];
if (process.env.COLD === "1") {
  // The case of schema.test.ts: one run, then the mean of 5 runs.
  const freshExpr = wrap(let_({ paths }, app("values", loop(v("paths"), ["p"], rec({ path: v("p"), kinds: app("values", call("distinct", loop(mine, ["n"], field(v("n"), "kind")))), count: app("count", call("distinct", loop(mine, ["n"], field(v("n"), "doc")))) })))));
  evaluate(freshExpr, opts);
  const t0 = performance.now();
  let r;
  for (let i = 0; i < 5; i++) r = evaluate(freshExpr, opts);
  const median = (performance.now() - t0) / 5;
  const check = r.ok ? String(JSON.stringify(r.value) === want) : `error ${r.error.code}`;
  out.push({ name: "cold: mean of 5 runs after 1", median, min: NaN, p90: NaN, check });
}
for (const [name, run] of Object.entries(cases)) {
  const r = run();
  // A case of SAME gives the records of Graph. A stage gives a count, and an error of a stage fails too.
  const evaluated = r !== null && typeof r === "object" && "ok" in r;
  let check = "n/a";
  if (evaluated && !r.ok) check = `error ${r.error.code}`;
  else if (SAME.has(name)) check = String(JSON.stringify(evaluated ? r.value : r) === want);
  for (let i = 0; i < WARM; i++) run();
  const ts = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    run();
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  out.push({ name, median: ts[Math.floor(ts.length / 2)], min: ts[0], p90: ts[Math.floor(ts.length * 0.9)], check });
}
const pilot = out.find((o) => o.name === "pilot (evaluate)").median;
for (const o of out) console.log(`${o.name.padEnd(40)} median ${o.median.toFixed(2).padStart(8)} ms  min ${o.min.toFixed(2).padStart(8)}  share of the pilot ${((100 * o.median) / pilot).toFixed(0).padStart(4)} %  same as Graph: ${o.check}`);
console.log(`target: 5 ms for one sample. The warm pilot needs a factor of ${(pilot / 5).toFixed(1)} on this machine.`);
if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify({ node: process.version, runs: RUNS, warm: WARM, cases: out }, null, 2));
// A result that is not the result of Graph fails the step. The numbers stay in the report.
const wrong = out.filter((o) => o.check !== "true" && o.check !== "n/a");
if (wrong.length > 0) {
  console.error(`not the same as inferSchema of Graph: ${wrong.map((o) => `${o.name} (${o.check})`).join(", ")}`);
  process.exitCode = 1;
}
