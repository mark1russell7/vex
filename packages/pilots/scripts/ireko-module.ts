/**
 * This script writes a standalone module of ireko (docs/COMPILER.md §13.3). Start it with
 * `npx tsx scripts/ireko-module.ts <grid|radial|layers|place|measure> <file>`. The strategies `grid`, `radial` and `layers` are programs.
 * The place pass of the engine is a sheet over the tree of the nodes. The fit of the measure pass is a sheet over one
 * node and its children. Node itself leaves spaces where the types of the copied functions were.
 */
import { emitModule, emitSheetModule, type Emitted } from "@mark1russell7/vex-compiler";
import { writeFileSync } from "node:fs";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "../src/ireko-grid.ts";
import { LAYERS_DOMAINS, LAYERS_PROGRAM, LAYERS_SCHEMA } from "../src/ireko-layers.ts";
import { MEASURE_COLUMNS, MEASURE_DOMAINS, MEASURE_KINDS, MEASURE_SCHEMA } from "../src/ireko-measure.ts";
import { PLACE_COLUMNS, PLACE_DOMAINS, PLACE_KINDS, PLACE_SCHEMA } from "../src/ireko-place.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA } from "../src/ireko-radial.ts";

const MODULES: Readonly<Record<string, () => Emitted>> = {
  grid: () => emitModule(GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "gridOf" }),
  radial: () => emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radialOf" }),
  layers: () => emitModule(LAYERS_PROGRAM, { domains: LAYERS_DOMAINS, schema: LAYERS_SCHEMA, name: "layersOf", lists: "plain" }),
  place: () => emitSheetModule(PLACE_COLUMNS, { domains: PLACE_DOMAINS, schema: PLACE_SCHEMA, kinds: PLACE_KINDS, space: "tree", name: "placeOf" }),
  measure: () => emitSheetModule(MEASURE_COLUMNS, { domains: MEASURE_DOMAINS, schema: MEASURE_SCHEMA, kinds: MEASURE_KINDS, space: "tree", name: "measureOf" }),
};

const [which, out] = process.argv.slice(2);
const emit = which === undefined ? undefined : MODULES[which];
if (emit === undefined) throw new Error("Give the module: grid, radial, layers, place or measure.");
if (out === undefined) throw new Error("Give the path of the module file.");
const m = emit();
if (!m.ok) throw new Error(m.reason);
writeFileSync(out, m.source);
