/**
 * The input of each standalone module of ireko (docs/COMPILER.md §13.3). The script `scripts/ireko-module.ts` and the
 * value tests read these rows, so a test prints the module of a build from the same input.
 */
import type { Expr } from "@mark1russell7/vex";
import { emitModule, emitSheetModule, functionText, type Emitted, type ModuleOptions, type SheetModuleOptions } from "@mark1russell7/vex-compiler/module";
import { BETWEEN_DOMAINS, BETWEEN_PROGRAM, BETWEEN_SCHEMA, BOUNDS_DOMAINS, BOUNDS_PROGRAM, BOUNDS_SCHEMA, OVERLAP_DOMAINS, OVERLAP_PROGRAM, OVERLAP_SCHEMA } from "./ireko-audit.ts";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "./ireko-grid.ts";
import { LAYERS_DOMAINS, LAYERS_PROGRAM, LAYERS_SCHEMA } from "./ireko-layers.ts";
import { MEASURE_COLUMNS, MEASURE_DOMAINS, MEASURE_KINDS, MEASURE_SCHEMA } from "./ireko-measure.ts";
import { PLACE_COLUMNS, PLACE_DOMAINS, PLACE_KINDS, PLACE_SCHEMA } from "./ireko-place.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA } from "./ireko-radial.ts";
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
} from "./ireko-route.ts";
import { NODE_SCHEMA, NODE_SHAPE, SHAPE_DOMAINS } from "./ireko-shapes.ts";
import { TREE_DOMAINS, TREE_PROGRAM, TREE_SCHEMA } from "./ireko-tree.ts";

/** The value of the option `faults` of a module (COMPILE.MODULE.FAULT). */
export type Faults = "value" | "throw";

/** A row of the table: the name of the function of the module, the expressions of the module, and the print of the module. */
interface IrekoRow {
  readonly name: string;
  readonly exprs: readonly Expr[];
  readonly print: (faults: Faults) => Emitted;
}

/** This function gives the row of a module of one program. Its expressions and its print come from one value. */
function moduleRow(name: string, program: Expr, options: Omit<ModuleOptions, "name" | "faults">): IrekoRow {
  return { name, exprs: [program], print: (faults) => emitModule(program, { ...options, name, faults }) };
}

/** This function gives the row of a module of a sheet. Its expressions and its print come from one value. */
function sheetRow(name: string, columns: ReadonlyMap<string, Expr>, options: Omit<SheetModuleOptions, "name" | "faults">): IrekoRow {
  return { name, exprs: [...columns.values()], print: (faults) => emitSheetModule(columns, { ...options, name, faults }) };
}

/** The name of a module of ireko. */
export type IrekoModule = "grid" | "radial" | "layers" | "tree" | "shape" | "place" | "measure" | "straight" | "orthogonal" | "avoid" | "direction" | "label" | "obstacles" | "overlap" | "bounds" | "between";

/** The rows of the modules. Each print has the options of a build. */
const ROWS: Readonly<Record<IrekoModule, IrekoRow>> = {
  grid: moduleRow("gridOf", GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA }),
  radial: moduleRow("radialOf", RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA }),
  layers: moduleRow("layersOf", LAYERS_PROGRAM, { domains: LAYERS_DOMAINS, schema: LAYERS_SCHEMA, lists: "plain" }),
  tree: moduleRow("treeOf", TREE_PROGRAM, { domains: TREE_DOMAINS, schema: TREE_SCHEMA, lists: "plain" }),
  shape: moduleRow("nodeShape", NODE_SHAPE, { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA }),
  place: sheetRow("placeOf", PLACE_COLUMNS, { domains: PLACE_DOMAINS, schema: PLACE_SCHEMA, kinds: PLACE_KINDS, space: "tree" }),
  measure: sheetRow("measureOf", MEASURE_COLUMNS, { domains: MEASURE_DOMAINS, schema: MEASURE_SCHEMA, kinds: MEASURE_KINDS, space: "tree" }),
  straight: moduleRow("straightOf", STRAIGHT_PROGRAM, { domains: ROUTE_DOMAINS, schema: ROUTER_SCHEMA, lists: "plain" }),
  orthogonal: moduleRow("orthogonalOf", ORTHOGONAL_PROGRAM, { domains: ROUTE_DOMAINS, schema: ROUTER_SCHEMA, lists: "plain" }),
  avoid: moduleRow("avoidOf", AVOID_PROGRAM, { domains: ROUTE_DOMAINS, schema: AVOID_SCHEMA, lists: "plain" }),
  direction: moduleRow("directionOf", EDGE_DIRECTION_PROGRAM, { domains: ROUTE_DOMAINS, schema: EDGE_DIRECTION_SCHEMA }),
  label: moduleRow("labelBoxOf", LABEL_BOX_PROGRAM, { domains: ROUTE_DOMAINS, schema: LABEL_BOX_SCHEMA, lists: "plain" }),
  obstacles: moduleRow("obstaclesOf", OBSTACLES_PROGRAM, { domains: ROUTE_DOMAINS, schema: OBSTACLES_SCHEMA, lists: "plain" }),
  overlap: moduleRow("overlapsOf", OVERLAP_PROGRAM, { domains: OVERLAP_DOMAINS, schema: OVERLAP_SCHEMA, lists: "plain" }),
  bounds: moduleRow("boundsOf", BOUNDS_PROGRAM, { domains: BOUNDS_DOMAINS, schema: BOUNDS_SCHEMA, lists: "plain" }),
  between: moduleRow("betweenOf", BETWEEN_PROGRAM, { domains: BETWEEN_DOMAINS, schema: BETWEEN_SCHEMA, lists: "plain" }),
};

/** The path of each committed file in the repository of ireko. */
export const IREKO_FILES: Readonly<Partial<Record<IrekoModule, string>>> = {
  measure: "packages/ireko/src/core/engine/measure.generated.js",
  place: "packages/ireko/src/core/engine/place.generated.js",
  shape: "packages/ireko/src/core/engine/shape.generated.js",
  grid: "packages/ireko/src/core/strategies/grid.generated.js",
  radial: "packages/ireko/src/core/strategies/radial.generated.js",
};

/** The modules that have a committed file in ireko. */
export const IREKO_COMMITTED: readonly IrekoModule[] = Object.keys(IREKO_FILES).filter(isIrekoModule);

/** The modules that have a program here and no committed file in ireko at this time. */
export const IREKO_NOT_COMMITTED: readonly IrekoModule[] = ["layers", "tree", "straight", "orthogonal", "avoid", "direction", "label", "obstacles", "overlap", "bounds", "between"];

/** This function tells if a text is the name of a module of ireko. */
export function isIrekoModule(text: string): text is IrekoModule {
  return Object.hasOwn(ROWS, text);
}

/** The name of each module of the table. */
export const IREKO_MODULES: readonly IrekoModule[] = Object.keys(ROWS).filter(isIrekoModule);

/** This function gives the expressions of a module of ireko, as its print reads them. */
export function irekoExprs(which: IrekoModule): readonly Expr[] {
  return ROWS[which].exprs;
}

/** This function gives the text of a module of ireko. A build takes `value`, and a value test takes `throw`. */
export function irekoSource(which: IrekoModule, faults: Faults): string {
  const m = ROWS[which].print(faults);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/**
 * This function compares a print with the bytes of its committed file. It gives nothing for equal bytes, and otherwise
 * a message with the first line that differs and the command that prints the file again (COMPILE.MODULE.BYTES).
 */
export function moduleDrift(file: string, printed: string, committed: string): string | undefined {
  if (printed === committed) return undefined;
  const ours = committed.split("\n");
  const theirs = printed.split("\n");
  const line = ours.findIndex((text, i) => text !== theirs[i]);
  const at = line < 0 ? ours.length : line;
  return [
    `${file} differs from its print at line ${String(at + 1)}.`,
    `  committed: ${(ours[at] ?? "(end of the file)").slice(0, 120)}`,
    `  printed:   ${(theirs[at] ?? "(end of the file)").slice(0, 120)}`,
    "Move the pin of vex to the commit that gives this print, and print the file again:",
    "  node packages/pilots/scripts/module-bytes.ts <path of this repository> --write",
  ].join("\n");
}

/** This function gives the name of the function of a module of ireko. */
export function irekoName(which: IrekoModule): string {
  return ROWS[which].name;
}

/** This function gives the named function of the text of a module. */
export function loadModule(source: string, name: string): unknown {
  // oxlint-disable-next-line typescript/no-implied-eval, typescript/no-unsafe-call -- the source comes from the printer, as in the build of ireko.
  return new Function(`${source.replaceAll(/^export /gm, "")}
return ${name};`)();
}

/** This function gives the function of a module of ireko, in the form where a fault of the printed code leaves the run. */
export function irekoRun(which: IrekoModule): unknown {
  return loadModule(irekoSource(which, "throw"), irekoName(which));
}

/** The functions whose text differs between the runners before the print. Each has the form that a formatter keeps. */
export const TEXT_CASES: readonly ((...a: never[]) => unknown)[] = [
  (a: boolean, b: boolean, c: boolean): boolean => (a && b) || c,
  (a: number): number => (a > 0 ? 0.5 : 1000),
  (a: { readonly x: number } | string): number => (a as { readonly x: number }).x,
  (a: number): number => {
    const twice: number = a * 2;
    return twice;
  },
];

/** This function gives the text of each function of a list, as a module copies it. */
export function textOfCases(cases: readonly ((...a: never[]) => unknown)[]): readonly string[] {
  return cases.map((f) => functionText(f));
}
