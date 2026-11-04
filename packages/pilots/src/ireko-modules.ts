/**
 * The input of each standalone module of ireko (docs/COMPILER.md §13.3). The script `scripts/ireko-module.ts` and the
 * value tests read these rows, so a test prints the module of a build from the same input.
 */
import { emitModule, emitSheetModule, functionText, type Emitted } from "@mark1russell7/vex-compiler/module";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA } from "./ireko-grid.ts";
import { LAYERS_DOMAINS, LAYERS_PROGRAM, LAYERS_SCHEMA } from "./ireko-layers.ts";
import { MEASURE_COLUMNS, MEASURE_DOMAINS, MEASURE_KINDS, MEASURE_SCHEMA } from "./ireko-measure.ts";
import { PLACE_COLUMNS, PLACE_DOMAINS, PLACE_KINDS, PLACE_SCHEMA } from "./ireko-place.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA } from "./ireko-radial.ts";
import { NODE_SCHEMA, NODE_SHAPE, SHAPE_DOMAINS } from "./ireko-shapes.ts";
import { TREE_DOMAINS, TREE_PROGRAM, TREE_SCHEMA } from "./ireko-tree.ts";

/** The value of the option `faults` of a module (COMPILE.MODULE.FAULT). */
export type Faults = "value" | "throw";

/** A row of the table: the name of the function of the module, and the print of the module. */
interface IrekoRow {
  readonly name: string;
  readonly print: (faults: Faults) => Emitted;
}

/** The name of a module of ireko. */
export type IrekoModule = "grid" | "radial" | "layers" | "tree" | "shape" | "place" | "measure";

/** The rows of the modules. Each print has the options of a build. */
const ROWS: Readonly<Record<IrekoModule, IrekoRow>> = {
  grid: { name: "gridOf", print: (faults) => emitModule(GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "gridOf", faults }) },
  radial: { name: "radialOf", print: (faults) => emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radialOf", faults }) },
  layers: { name: "layersOf", print: (faults) => emitModule(LAYERS_PROGRAM, { domains: LAYERS_DOMAINS, schema: LAYERS_SCHEMA, name: "layersOf", lists: "plain", faults }) },
  tree: { name: "treeOf", print: (faults) => emitModule(TREE_PROGRAM, { domains: TREE_DOMAINS, schema: TREE_SCHEMA, name: "treeOf", lists: "plain", faults }) },
  shape: { name: "nodeShape", print: (faults) => emitModule(NODE_SHAPE, { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape", faults }) },
  place: { name: "placeOf", print: (faults) => emitSheetModule(PLACE_COLUMNS, { domains: PLACE_DOMAINS, schema: PLACE_SCHEMA, kinds: PLACE_KINDS, space: "tree", name: "placeOf", faults }) },
  measure: { name: "measureOf", print: (faults) => emitSheetModule(MEASURE_COLUMNS, { domains: MEASURE_DOMAINS, schema: MEASURE_SCHEMA, kinds: MEASURE_KINDS, space: "tree", name: "measureOf", faults }) },
};

/** The modules that have a committed file in ireko. */
export const IREKO_COMMITTED: readonly IrekoModule[] = ["measure", "place", "shape", "grid", "radial"];

/** The modules that have a program here and no committed file in ireko at this time. */
export const IREKO_NOT_COMMITTED: readonly IrekoModule[] = ["layers", "tree"];

/** This function tells if a text is the name of a module of ireko. */
export function isIrekoModule(text: string): text is IrekoModule {
  return Object.hasOwn(ROWS, text);
}

/** This function gives the text of a module of ireko. A build takes `value`, and a value test takes `throw`. */
export function irekoSource(which: IrekoModule, faults: Faults): string {
  const m = ROWS[which].print(faults);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
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
    const twice = (x: number): number => x * 2;
    return twice(a);
  },
];

/** This function gives the text of each function of a list, as a module copies it. */
export function textOfCases(cases: readonly ((...a: never[]) => unknown)[]): readonly string[] {
  return cases.map((f) => functionText(f));
}
