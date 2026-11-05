/**
 * The print of the modules of ireko in one fresh process, for the gate `module-cost.ts`. The gate copies this file into a
 * checkout of the base commit, so it reads only what the table of that commit has.
 *
 * The input names one module, or a list with commas that the child prints in its order. The child prints the time of all
 * the prints as one line of JSON. The time of the imports does not count.
 *
 * The flag `--add` is for the read that tests the gate. It holds the share of added work of each module, for example
 * `grid:0.15,shape:0.15`, and the child spins for that share of its time. Only the branch arm of that read has the flag.
 *
 * The flag `--add-first` holds a count and a folder, for example `2:/tmp/counts`. The child adds the work only in that count
 * of its first starts on a module. It counts the starts in a file of the folder, before the measured time.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { irekoSource, isIrekoModule } from "../src/ireko-modules.ts";

const input = process.argv[process.argv.indexOf("--input") + 1] ?? "";
const names = input.split(",");
const modules = names.filter(isIrekoModule);
if (modules.length !== names.length) throw new Error(`module-cost: the table of this commit does not have each module of "${names.join(",")}".`);
const addAt = process.argv.indexOf("--add");
const adds = addAt < 0 ? [] : (process.argv[addAt + 1] ?? "").split(",").map((part) => part.split(":"));
const share = Number(adds.find(([name]) => name === input)?.[1] ?? 0);

/** This function counts this start of the module, and it gives true when the start is one of the first starts of the flag. */
function inFirstStarts(flag: string): boolean {
  const colon = flag.indexOf(":");
  const file = join(flag.slice(colon + 1), input);
  const seen = existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
  writeFileSync(file, String(seen + 1));
  return seen < Number(flag.slice(0, colon));
}

const firstAt = process.argv.indexOf("--add-first");
const add = firstAt < 0 || inFirstStarts(process.argv[firstAt + 1] ?? "") ? share : 0;

const start = performance.now();
for (const which of modules) irekoSource(which, "value");
const end = start + (performance.now() - start) * (1 + add);
while (performance.now() < end);
console.info(JSON.stringify({ ms: performance.now() - start }));
