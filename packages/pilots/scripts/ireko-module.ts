/**
 * This script writes a standalone module of ireko (docs/COMPILER.md §13.3). Start it with
 * `npx tsx scripts/ireko-module.ts <grid|radial|layers|tree|place|measure|straight|orthogonal|avoid|direction|label|obstacles> <file>`. The strategies `grid`, `radial`,
 * `layers` and `tree` are programs. The routers and the calculations of the route pass are programs too.
 * The place pass of the engine is a sheet over the tree of the nodes. The fit of the measure pass is a sheet over one
 * node and its children. Node itself leaves spaces where the types of the copied functions were.
 */
import { emitModule, emitSheetModule, type Emitted } from "@mark1russell7/vex-compiler";
import { writeFileSync } from "node:fs";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "../src/ireko-grid.ts";
import { LAYERS_DOMAINS, LAYERS_PROGRAM, LAYERS_SCHEMA } from "../src/ireko-layers.ts";
import { MEASURE_COLUMNS, MEASURE_DOMAINS, MEASURE_KINDS, MEASURE_SCHEMA } from "../src/ireko-measure.ts";
import {
  AVOID_PROGRAM,
  AVOID_SCHEMA,
  EDGE_DIRECTION_PROGRAM,
  EDGE_DIRECTION_SCHEMA,
  LABEL_BOX_PROGRAM,
  LABEL_BOX_SCHEMA,
  OBSTACLES_PROGRAM,
  OBSTACLES_SCHEMA,
  ORTHOGONAL_PROGRAM,
  ROUTE_DOMAINS,
  ROUTER_SCHEMA,
  STRAIGHT_PROGRAM,
} from "../src/ireko-route.ts";
import { TREE_DOMAINS, TREE_PROGRAM, TREE_SCHEMA } from "../src/ireko-tree.ts";
import { PLACE_COLUMNS, PLACE_DOMAINS, PLACE_KINDS, PLACE_SCHEMA } from "../src/ireko-place.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA } from "../src/ireko-radial.ts";

const MODULES: Readonly<Record<string, () => Emitted>> = {
  grid: () => emitModule(GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "gridOf" }),
  radial: () => emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radialOf" }),
  layers: () => emitModule(LAYERS_PROGRAM, { domains: LAYERS_DOMAINS, schema: LAYERS_SCHEMA, name: "layersOf", lists: "plain" }),
  tree: () => emitModule(TREE_PROGRAM, { domains: TREE_DOMAINS, schema: TREE_SCHEMA, name: "treeOf", lists: "plain" }),
  straight: () => emitModule(STRAIGHT_PROGRAM, { domains: ROUTE_DOMAINS, schema: ROUTER_SCHEMA, name: "straightOf", lists: "plain" }),
  orthogonal: () => emitModule(ORTHOGONAL_PROGRAM, { domains: ROUTE_DOMAINS, schema: ROUTER_SCHEMA, name: "orthogonalOf", lists: "plain" }),
  avoid: () => emitModule(AVOID_PROGRAM, { domains: ROUTE_DOMAINS, schema: AVOID_SCHEMA, name: "avoidOf", lists: "plain" }),
  direction: () => emitModule(EDGE_DIRECTION_PROGRAM, { domains: ROUTE_DOMAINS, schema: EDGE_DIRECTION_SCHEMA, name: "directionOf" }),
  label: () => emitModule(LABEL_BOX_PROGRAM, { domains: ROUTE_DOMAINS, schema: LABEL_BOX_SCHEMA, name: "labelBoxOf", lists: "plain" }),
  obstacles: () => emitModule(OBSTACLES_PROGRAM, { domains: ROUTE_DOMAINS, schema: OBSTACLES_SCHEMA, name: "obstaclesOf", lists: "plain" }),
  place: () => emitSheetModule(PLACE_COLUMNS, { domains: PLACE_DOMAINS, schema: PLACE_SCHEMA, kinds: PLACE_KINDS, space: "tree", name: "placeOf" }),
  measure: () => emitSheetModule(MEASURE_COLUMNS, { domains: MEASURE_DOMAINS, schema: MEASURE_SCHEMA, kinds: MEASURE_KINDS, space: "tree", name: "measureOf" }),
};

const [which, out] = process.argv.slice(2);
const emit = which === undefined ? undefined : MODULES[which];
if (emit === undefined) throw new Error("Give the module: grid, radial, layers, tree, place, measure, straight, orthogonal, avoid, direction, label or obstacles.");
if (out === undefined) throw new Error("Give the path of the module file.");
const m = emit();
if (!m.ok) throw new Error(m.reason);
writeFileSync(out, m.source);
