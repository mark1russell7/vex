/**
 * This script writes a standalone module of ireko (docs/COMPILER.md §13.3). Start it with
 * `npx tsx scripts/ireko-module.ts <grid|radial|place> <file>`. The strategies `grid` and `radial` are programs. The
 * place pass of the engine is a sheet over the tree of the nodes. Node itself leaves spaces where the types of the
 * copied functions were.
 */
import { emitModule, emitSheetModule, type Emitted } from "@mark1russell7/vex-compiler";
import { writeFileSync } from "node:fs";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "../src/ireko-grid.ts";
import { PLACE_COLUMNS, PLACE_DOMAINS, PLACE_KINDS, PLACE_SCHEMA } from "../src/ireko-place.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA } from "../src/ireko-radial.ts";

const MODULES: Readonly<Record<string, () => Emitted>> = {
  grid: () => emitModule(GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "gridOf" }),
  radial: () => emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radialOf" }),
  place: () => emitSheetModule(PLACE_COLUMNS, { domains: PLACE_DOMAINS, schema: PLACE_SCHEMA, kinds: PLACE_KINDS, space: "tree", name: "placeOf" }),
};

const [which, out] = process.argv.slice(2);
const emit = which === undefined ? undefined : MODULES[which];
if (emit === undefined) throw new Error("Give the module: grid, radial or place.");
if (out === undefined) throw new Error("Give the path of the module file.");
const m = emit();
if (!m.ok) throw new Error(m.reason);
writeFileSync(out, m.source);
