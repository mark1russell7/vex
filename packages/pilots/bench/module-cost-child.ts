/**
 * The print of the modules of ireko in one fresh process, for the gate `module-cost.ts`. The gate copies this file into a
 * checkout of the base commit, so it reads only what the table of that commit has.
 *
 * The input names one module, or a list with commas that the child prints in its order. The child prints the time of all
 * the prints as one line of JSON. The time of the imports does not count.
 *
 * The flag `--add` is for the read that tests the gate. It holds the share of added work of each module, for example
 * `grid:0.15,shape:0.15`, and the child spins for that share of its time. Only the branch arm of that read has the flag.
 */
import { irekoSource, isIrekoModule } from "../src/ireko-modules.ts";

const input = process.argv[process.argv.indexOf("--input") + 1] ?? "";
const names = input.split(",");
const modules = names.filter(isIrekoModule);
if (modules.length !== names.length) throw new Error(`module-cost: the table of this commit does not have each module of "${names.join(",")}".`);
const addAt = process.argv.indexOf("--add");
const adds = addAt < 0 ? [] : (process.argv[addAt + 1] ?? "").split(",").map((part) => part.split(":"));
const add = Number(adds.find(([name]) => name === input)?.[1] ?? 0);

const start = performance.now();
for (const which of modules) irekoSource(which, "value");
const end = start + (performance.now() - start) * (1 + add);
while (performance.now() < end);
console.info(JSON.stringify({ ms: performance.now() - start }));
