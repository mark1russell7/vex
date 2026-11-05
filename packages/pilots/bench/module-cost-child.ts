/**
 * One print of one module of ireko in a fresh process, for the gate `module-cost.ts`. The gate copies this file into a
 * checkout of the base commit, so it reads only what the table of that commit has.
 *
 * The child prints the time of the print as one line of JSON. The time of the imports does not count.
 */
import { irekoSource, isIrekoModule } from "../src/ireko-modules.ts";

const which = process.argv[process.argv.indexOf("--input") + 1] ?? "";
if (!isIrekoModule(which)) throw new Error(`module-cost: the table of this commit has no module "${which}".`);
const start = performance.now();
irekoSource(which, "value");
console.info(JSON.stringify({ ms: performance.now() - start }));
