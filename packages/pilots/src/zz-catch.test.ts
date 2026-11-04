// @ts-nocheck
// Throwaway: the figures of CATCHFAULT in CI. This test fails on purpose, so its message holds the table. Do not merge.
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { it } from "vitest";
import { irekoSource } from "./ireko-modules.ts";
import { scan, catches } from "./zz-names.mjs";

const root = new URL("../../../", import.meta.url);
const dir = readdirSync(new URL("node_modules/.pnpm/", root)).find((d) => d.startsWith("esbuild@"));
const esbuild = createRequire(new URL(`node_modules/.pnpm/${dir}/node_modules/esbuild/package.json`, root))("esbuild");
const NAMES = ["grid", "radial", "layers", "tree", "shape", "place", "measure", "straight", "orthogonal", "avoid", "direction", "label", "obstacles", "overlap", "bounds", "between"];
const OUT = [];
const log = (...a) => OUT.push(a.join(" "));

it("CATCHFAULT figures", async () => {
for (const faults of ["value", "throw"]) {
  log(`--- ${faults}`);
  for (const m of NAMES) {
    const src = irekoSource(m, faults);
    const { free, early, tree } = scan(src);
    const c = catches(tree);
    const text = src.split("catch {").length - 1;
    const copyLines = src.split("\n").filter((l) => /^const (op|v)_/.test(l));
    const inCopy = copyLines.filter((l) => l.includes("catch")).length;
    const direct = early.filter((e) => e.direct);
    log(m.padEnd(11), "bytes", String(src.length).padStart(6), "catch", c.plain, "+", c.bound, "text", text, "inCopy", inCopy, "copies", copyLines.length, "free", [...free.keys()].sort().join(","), "| early direct", direct.length, "closure", early.length - direct.length);
    for (const e of direct.slice(0, 5)) log("   DIRECT", e.name, "line", e.line, src.split("\n")[e.line - 1].trim().slice(0, 100));
  }
}


const gz = (s) => gzipSync(Buffer.from(s, "utf8"), { level: 9 }).length;
const min = (s) => esbuild.transformSync(s, { minify: true, format: "esm", target: "es2022" }).code;
const edit = (source, name, bind, helper) => {
  const lines = source.split("\n").map((l) => (/^const (?:op|v)_/.test(l) ? l : l.replaceAll("catch {", `catch (${bind}) { ${name}(${bind});`)));
  return lines.join("\n").replace("const E = {};\n", `const E = {};\n${helper}\n`);
};
const FORMS = {
  rf: (s) => edit(s, "RF", "$f", "function RF(x) { if (x instanceof ReferenceError) throw x; }"),
  h: (s) => edit(s, "H", "$", "function H(x) { if (x instanceof ReferenceError) throw x; }"),
  hE: (s) => edit(s, "H", "$", "function H(x) { if (x !== E && x instanceof ReferenceError) throw x; }"),
};
const rows = [];
for (const m of NAMES) {
  const value = irekoSource(m, "value");
  const thrown = irekoSource(m, "throw");
  if (/\bH\(/.test(value)) throw new Error(`H is used in ${m}`);
  const { tree } = scan(value);
  const c = catches(tree);
  const row = { m, catches: c.plain + c.bound, text: value.split("catch {").length - 1, inCopy: value.split("\n").filter((l) => /^const (?:op|v)_/.test(l) && l.includes("catch")).length };
  row.base = { b: Buffer.byteLength(value), gz: gz(value), mb: Buffer.byteLength(min(value)), mgz: gz(min(value)) };
  for (const [k, f] of Object.entries(FORMS)) {
    const t = f(value);
    row[k] = { b: Buffer.byteLength(t), gz: gz(t), mb: Buffer.byteLength(min(t)), mgz: gz(min(t)) };
  }
  row.thr = { b: Buffer.byteLength(thrown), gz: gz(thrown), mb: Buffer.byteLength(min(thrown)), mgz: gz(min(thrown)) };
  rows.push(row);
}
const sum = (k, f) => rows.reduce((a, r) => a + r[k][f], 0);
const pad = (x, n = 7) => String(x).padStart(n);
log("module      catches inCopy |  bytes   gz  mingz | A(RF) +b +gz +mgz | A(H) +b +gz +mgz | A(H,E) +gz +mgz | throw +b +gz +mgz");
for (const r of rows) {
  const d = (k, f) => r[k][f] - r.base[f];
  log(r.m.padEnd(11), pad(r.catches, 3), pad(r.inCopy, 2), "|", pad(r.base.b), pad(r.base.gz), pad(r.base.mgz), "|", pad(d("rf", "b"), 5), pad(d("rf", "gz"), 4), pad(d("rf", "mgz"), 4), "|", pad(d("h", "b"), 5), pad(d("h", "gz"), 4), pad(d("h", "mgz"), 4), "|", pad(d("hE", "gz"), 4), pad(d("hE", "mgz"), 4), "|", pad(d("thr", "b"), 5), pad(d("thr", "gz"), 4), pad(d("thr", "mgz"), 4));
}
const tot = (k, f) => sum(k, f) - sum("base", f);
log("TOTAL", rows.reduce((a, r) => a + r.catches, 0), "| base", sum("base", "b"), sum("base", "gz"), sum("base", "mb"), sum("base", "mgz"), "| RF +", tot("rf", "b"), tot("rf", "gz"), tot("rf", "mb"), tot("rf", "mgz"), "| H +", tot("h", "b"), tot("h", "gz"), tot("h", "mb"), tot("h", "mgz"), "| H,E +", tot("hE", "b"), tot("hE", "gz"), tot("hE", "mb"), tot("hE", "mgz"), "| throw +", tot("thr", "b"), tot("thr", "gz"), tot("thr", "mb"), tot("thr", "mgz"));

const rounds = 15;
const pr = [], sc = [], pa = [];
for (let i = 0; i < rounds; i++) {
  const t0 = performance.now();
  const texts = NAMES.map((m) => irekoSource(m, "value"));
  const t1 = performance.now();
  const trees = texts.map((t) => scan(t));
  const t2 = performance.now();
  const { acorn } = await import("./zz-names.mjs");
  for (const t of texts) acorn.parse(t, { ecmaVersion: "latest", sourceType: "module" });
  const t3 = performance.now();
  pr.push(t1 - t0); sc.push(t2 - t1); pa.push(t3 - t2);
  if (trees.length !== 16) throw new Error("rounds");
}
const med = (a) => a.toSorted((x, y) => x - y)[a.length >> 1];
log("TIME ms (CI) rounds", rounds, "print of 16: first", pr[0].toFixed(0), "median", med(pr).toFixed(1), "| scan first", sc[0].toFixed(1), "median", med(sc).toFixed(1), "| parse only median", med(pa).toFixed(1));

  throw new Error("\n" + OUT.join("\n"));
}, 300_000);
