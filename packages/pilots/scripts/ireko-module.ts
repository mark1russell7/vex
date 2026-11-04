/**
 * This script writes a standalone module of ireko (docs/COMPILER.md §13.3). Start it with
 * `npx tsx scripts/ireko-module.ts <grid|radial|layers|tree|shape|place|measure> <file>`. The strategies `grid`, `radial`, `layers` and `tree` are programs.
 * The place pass of the engine is a sheet over the tree of the nodes. The fit of the measure pass is a sheet over one
 * node and its children. The module `shape` gives the shape of one node. Node itself leaves spaces where the types of the copied functions were.
 */
import { writeFileSync } from "node:fs";
import { irekoSource, isIrekoModule } from "../src/ireko-modules.ts";

const [which, out] = process.argv.slice(2);
if (which === undefined || !isIrekoModule(which)) throw new Error("Give the module: grid, radial, layers, tree, shape, place or measure.");
if (out === undefined) throw new Error("Give the path of the module file.");
writeFileSync(out, irekoSource(which, "value"));
