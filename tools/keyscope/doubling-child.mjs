// One compile of a doubling program with shared objects. Throwaway measure of a draft pull request.
import { app, axes, each, let_, ref, v } from "@mark1russell7/vex";
const compiler = await import("@mark1russell7/vex-compiler");
const emitModule = compiler.emitModule ?? (await import("@mark1russell7/vex-compiler/module")).emitModule;
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";

const [mode, shape, depthText] = process.argv.slice(2);
const depth = Number(depthText);
const n = ref("n");
const options = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } };
function named(d) {
  let e = v(`x${d}`);
  for (let i = d; i > 0; i--) e = let_({ [`x${i}`]: app("add", v(`x${i - 1}`), v(`x${i - 1}`)) }, e);
  return let_({ x0: n }, e);
}
function shared() {
  const start = shape === "constant" ? app("sum", each(axes.all, n)) : n;
  const up = shape === "loop" ? (x) => app("sum", each(axes.all, app("add", x, x))) : (x) => app("add", x, x);
  let e = start;
  for (let i = 0; i < depth; i++) e = up(e);
  return e;
}
const e = shape === "let" ? named(depth) : shared();
const t0 = performance.now();
const r = mode === "module" ? emitModule(e, options) : compiler.generate(e, options);
const ms = Math.round(performance.now() - t0);
const bytes = r.ok ? r.source.length : undefined;
process.stdout.write(`${JSON.stringify({ ok: r.ok, reason: r.ok ? undefined : r.reason.slice(0, 100), ms, bytes, rssMB: Math.round(process.resourceUsage().maxRSS / 1024) })}\n`);
