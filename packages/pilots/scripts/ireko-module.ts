/**
 * This script writes the standalone module of a strategy of ireko (docs/COMPILER.md §13.3). Start it with
 * `npx tsx scripts/ireko-module.ts <grid|radial> <file>`. Node itself leaves spaces where the types of the copied
 * functions were.
 */
import { emitModule } from "@mark1russell7/vex-compiler";
import { writeFileSync } from "node:fs";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "../src/ireko-grid.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA } from "../src/ireko-radial.ts";

const STRATEGIES = {
  grid: { program: GRID_PROGRAM, domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "gridOf" },
  radial: { program: RADIAL_PROGRAM, domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radialOf" },
};

const [strategy, out] = process.argv.slice(2);
if (strategy !== "grid" && strategy !== "radial") throw new Error("Give the strategy: grid or radial.");
if (out === undefined) throw new Error("Give the path of the module file.");
const { program, ...options } = STRATEGIES[strategy];
const m = emitModule(program, options);
if (!m.ok) throw new Error(m.reason);
writeFileSync(out, m.source);
