// One compile of one doubling program in a fresh process. Throwaway measure of a draft pull request.
// The form `shared` holds one object at many places. The form `json` is the same program through a JSON round trip, so it has no shared object.
import { app, axes, each, ref } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";

const compiler = await import("@mark1russell7/vex-compiler");
const emitModule = compiler.emitModule ?? (await import("@mark1russell7/vex-compiler/module")).emitModule;

const [mode, shape, depthText, form] = process.argv.slice(2);
const depth = Number(depthText);
const n = ref("n");
const options = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } };

function program() {
  const start = shape === "constant" ? app("sum", each(axes.all, n)) : n;
  const up = shape === "loop" ? (x) => app("sum", each(axes.all, app("add", x, x))) : (x) => app("add", x, x);
  let e = start;
  for (let i = 0; i < depth; i++) e = up(e);
  return form === "json" ? JSON.parse(JSON.stringify(e)) : e;
}

const e = program();
if (mode === "walk") {
  const { placesError, unsharedAll } = await import(new URL("../../compiler/src/unshared.ts", import.meta.url).href);
  const t0 = performance.now();
  placesError([e]);
  unsharedAll([e]);
  process.stdout.write(`${JSON.stringify({ ok: true, ms: performance.now() - t0 })}\n`);
} else {
  const t0 = performance.now();
  const r = mode === "module" ? emitModule(e, options) : compiler.generate(e, options);
  const ms = performance.now() - t0;
  process.stdout.write(`${JSON.stringify({ ok: r.ok, ms, bytes: r.ok ? r.source.length : undefined })}\n`);
}
