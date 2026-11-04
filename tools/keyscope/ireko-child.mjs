// One compile of one module of ireko in a fresh process. Throwaway measure of a draft pull request.
import { irekoSource } from "../src/ireko-modules.ts";

const [which] = process.argv.slice(2);
const t0 = performance.now();
const source = irekoSource(which, "value");
const ms = performance.now() - t0;
process.stdout.write(`${JSON.stringify({ ok: true, ms, bytes: source.length })}\n`);
