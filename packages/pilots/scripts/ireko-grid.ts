/**
 * This script writes the standalone module of the strategy `grid` for ireko (docs/COMPILER.md §13.3). Start it with
 * `npx tsx scripts/ireko-grid.ts <file>`. Node itself leaves spaces where the types of the copied functions were.
 */
import { emitModule } from "@mark1russell7/vex-compiler";
import { writeFileSync } from "node:fs";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "../src/ireko-grid.ts";

const out = process.argv[2];
if (out === undefined) throw new Error("Give the path of the module file.");
const m = emitModule(GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "gridOf" });
if (!m.ok) throw new Error(m.reason);
writeFileSync(out, m.source);
