// This script runs the programs of V-084 and V-085 on the published 0.17.2 of vex-compiler, and it records the results.
import { readFileSync } from "node:fs";
import { app, axes, call, evaluate, fn, fold, let_, lit, ref, space, v } from "@mark1russell7/vex";
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
console.log(`DIFFERS ${differs}`);
process.exitCode = differs === 0 ? 0 : 1;
