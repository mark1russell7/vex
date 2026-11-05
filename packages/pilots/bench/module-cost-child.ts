/**
 * The print of the modules of ireko in one fresh process, for the gate `module-cost.ts`. The gate copies this file into a
 * checkout of the base commit, so it reads only what the table of that commit has.
 *
 * The input names one module, or a list with commas that the child prints in its order. The child prints the time of all
 * the prints as one line of JSON. The time of the imports does not count.
 */
import { irekoSource, isIrekoModule } from "../src/ireko-modules.ts";

const names = (process.argv[process.argv.indexOf("--input") + 1] ?? "").split(",");
const modules = names.filter(isIrekoModule);
if (modules.length !== names.length) throw new Error(`module-cost: the table of this commit does not have each module of "${names.join(",")}".`);
const start = performance.now();
for (const which of modules) irekoSource(which, "value");
console.info(JSON.stringify({ ms: performance.now() - start }));
