// One compile of a doubling program with shared objects. Throwaway measure of a draft pull request.
import { app, axes, each, ref } from "@mark1russell7/vex";
import { emitModule } from "@mark1russell7/vex-compiler/module";
import { generate } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";

const [mode, shape, depthText] = process.argv.slice(2);
const depth = Number(depthText);
const n = ref("n");
const options = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } };
const start = { plain: n, constant: app("sum", each(axes.all, n)), loop: n }[shape];
const up = shape === "loop" ? (x) => app("sum", each(axes.all, app("add", x, x))) : (x) => app("add", x, x);
let e = start;
for (let i = 0; i < depth; i++) e = up(e);
const t0 = performance.now();
const r = mode === "module" ? emitModule(e, options) : generate(e, options);
const ms = Math.round(performance.now() - t0);
const bytes = r.ok ? r.source.length : undefined;
process.stdout.write(`${JSON.stringify({ ok: r.ok, reason: r.ok ? undefined : r.reason.slice(0, 100), ms, bytes, rssMB: Math.round(process.resourceUsage().maxRSS / 1024) })}\n`);
