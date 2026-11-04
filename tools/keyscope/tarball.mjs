// This script runs the programs of V-084 and V-085 on the published 0.17.2 of vex-compiler, and it records the results.
import { readFileSync } from "node:fs";
import { app, axes, call, each, evaluate, fn, fold, let_, lit, ref, space, v } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";
import { emitModule } from "@mark1russell7/vex-compiler";

const version = JSON.parse(readFileSync("node_modules/@mark1russell7/vex-compiler/package.json", "utf8")).version;
console.log(`VERSION ${version}`);
const op = app;
const n = ref("n");
const s = v("s");
const COST = op("max", op("abs", op("subtract", n, op("divide", n, lit(2)))), op("abs", op("add", n, op("multiply", n, lit(3)))));
const scanIn = (step, value) => fold(axes.all, { s: lit(0) }, { s: op("add", step, fold(axes.where(axes.all, op("gt", s, value)), { y: lit(0) }, { y: lit(1) }, v("y"))) }, s);
const PROGRAMS = {
  "V-084": scanIn(COST, op("add", lit(1), COST)),
  "V-085": let_({ g: fn(["x"], op("add", v("x"), ref("n", [{ t: "origin" }]))) }, fold(axes.where(axes.all, op("gt", call("g", lit(1)), n)), { s: lit(0) }, { s: op("add", s, lit(1)) }, s)),
};
const domains = [NumDomain, BoolDomain];
const schema = { fields: { n: "number", w: "number" }, vars: { a: "number" } };
const records = [{ n: 1, w: 1 }, { n: 2, w: 1 }, { n: 3, w: 1 }];
const sp = space.array(records);
let differs = 0;
for (const [id, e] of Object.entries(PROGRAMS)) {
  const expected = sp.keys.map((origin) => evaluate(e, { space: sp, origin, vars: { a: 2 }, domains }));
  console.log(`${id} interpreter ${JSON.stringify(expected)}`);
  const m = emitModule(e, { domains, schema });
  if (!m.ok) {
    console.log(`${id} refused ${m.reason}`);
    continue;
  }
  const scan = /= PF\(n,/.test(m.source);
  const pack = /\bpk\d+/.test(m.source);
  const made = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)();
  try {
    const got = made.run(records, { a: 2 }).map((x) => (x === made.VEX_ERROR ? "ERROR" : x));
    const want = expected.map((r) => (r.ok ? r.value : "ERROR"));
    const same = JSON.stringify(got) === JSON.stringify(want);
    if (!same) differs++;
    console.log(`${id} module ${JSON.stringify(got)} same=${same} scan=${scan} pack=${pack}`);
  } catch (x) {
    differs++;
    console.log(`${id} threw ${String(x)} scan=${scan} pack=${pack}`);
  }
}
// V-086: the text at fuse false, for a print that a safe value drops. A read of a parameter of the origin needs its declaration.
const at = ref("n", [{ t: "origin" }]);
const near = op("sum", each(axes.where(axes.all, op("eq", n, op("add", at, v("u")))), lit(1)));
const dropped = let_({ g: fn(["u"], op("ifError", lit(0), fold(axes.all, { s: lit(0) }, { s: op("add", n, near) }, s))) }, call("g", lit(0)));
const wanted = sp.keys.map((origin) => evaluate(dropped, { space: sp, origin, vars: { a: 2 }, domains })).map((r) => (r.ok ? r.value : "ERROR"));
for (const [mode, options] of Object.entries({ default: {}, "fuse false": { fuse: false }, throw: { faults: "throw" } })) {
  const m = emitModule(dropped, { domains, schema, ...options });
  if (!m.ok) {
    console.log(`V-086 ${mode}: refused ${m.reason}`);
    continue;
  }
  const declared = new Set([...m.source.matchAll(/\(([^()]*)\) =>/g)].flatMap((x) => x[1].split(/, */)));
  const free = [...new Set(m.source.match(/\bo\d+\b/g) ?? [])].filter((x) => !declared.has(x));
  const made = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)();
  const got = made.run(records, { a: 2 }).map((x) => (x === made.VEX_ERROR ? "ERROR" : x));
  const same = JSON.stringify(got) === JSON.stringify(wanted);
  if (!same) differs++;
  console.log(`V-086 ${mode}: reads with no declaration ${JSON.stringify(free)}, module ${JSON.stringify(got)} same=${same}`);
}
console.log(`DIFFERS ${differs}`);
process.exitCode = differs === 0 ? 0 : 1;
