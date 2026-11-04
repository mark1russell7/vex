/**
 * The cases of the measurement of the share of tier 2 (FALLBACKSHARE). Each case starts real programs on the inputs
 * of their tests. The programs are the programs of `PILOTS`, with the inputs of `inputs.ts`. The formulas of the example
 * sheets of the sheet app are programs too. The random inputs come from `fc.sample` with a fixed seed, and with the number of runs of the test.
 */
import { SheetRun, space, type Expr } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { compileFormula, FORMULA_DOMAINS, toVexChain } from "@vex/formula";
import { showTable } from "@vex/sheet-app/src/book.ts";
import { evaluateBook, type Compiler } from "@vex/sheet-app/src/engine.ts";
import { EXAMPLES, exampleBook } from "@vex/sheet-app/src/examples.ts";
import * as fc from "fast-check";
import { BOM_COLUMNS, bomFormula, type Part } from "./bom.ts";
import type { ShareCase } from "./fallback-share.ts";
import { FORCE_DOMAINS, forceProgram, type ForceOptions } from "./force.ts";
import { GRADE_COLUMNS, gradeFormula, studentKey, type SchoolClass } from "./grades.ts";
import { heatStep, heatVex, type HeatGrid } from "./heat.ts";
import {
  auditTree,
  bandLimit,
  BOM_BIKE,
  BOM_BROKEN,
  bomProduct,
  childRecord,
  fitChild,
  FORCE_FIXED,
  forceGraph,
  forceInput,
  forceOptions,
  GRADE_CLASSES,
  gradeSchool,
  GRID_LINKED,
  gridInput,
  HEAT_CENTER,
  heatAlpha,
  heatGrid,
  heatSteps,
  INVOICE_BAD,
  INVOICE_GOOD,
  invoiceList,
  layersInput,
  treeInput,
  LOAN_FOUR,
  LOAN_LONG,
  loanMonth,
  loanTerms,
  measureVars,
  NODE_FIXED_KIDS,
  NODE_INFINITE,
  placeTreeInput,
  RADIAL_MIXED,
  radialRing,
  schemaDocs,
  SCHEMA_DEEP,
  SCHEMA_EXAMPLE,
  SCHEMA_ODD_KEYS,
  schemaSample,
  shapeChild,
  shapeExtent,
  SHAPES_INFINITE,
  shapeTree,
} from "./inputs.ts";
import { INVOICE_COLUMNS, invoiceFormula, LINE_COLUMNS, lineKey, type Invoice } from "./invoice.ts";
import { ESCAPE_DOMAINS, ESCAPE_PROGRAM, escapeRun } from "./ireko-audit.ts";
import { GRID_DOMAINS, GRID_PROGRAM, gridRun } from "./ireko-grid.ts";
import { MEASURE_COLUMNS, MEASURE_DOMAINS, measureRecords, measureSpace } from "./ireko-measure.ts";
import { PLACE_COLUMNS, PLACE_DOMAINS, placeSpace } from "./ireko-place.ts";
import { LAYERS_DOMAINS, LAYERS_PROGRAM, layersRun } from "./ireko-layers.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, radialRun } from "./ireko-radial.ts";
import { MAX_BANDS, NODE_SHAPE, SHAPE_COLUMNS, SHAPE_DOMAINS, shapeSpace, type ShapeRecord } from "./ireko-shapes.ts";
import { TREE_DOMAINS, TREE_PROGRAM, treeRun } from "./ireko-tree.ts";
import { LOAN_COLUMNS, loanFormula, loanFormulas, type LoanMonth, type LoanTerms } from "./loan.ts";
import { formulas, PILOTS } from "./programs.ts";
import { SCHEMA_DOMAINS, SCHEMA_PROGRAM } from "./schema.ts";

/** The options of the cases. */
export interface CaseOptions {
  /** The seed of the random inputs. */
  readonly seed: number;
  /** A factor for the number of random inputs of each case. The value 1 gives the number of runs of the test. */
  readonly scale?: number;
}

/** This function gives `n` random inputs of `arb`, for the seed and the scale of `o`. */
function sample<T>(arb: fc.Arbitrary<T>, n: number, o: CaseOptions): T[] {
  const numRuns = Math.max(1, Math.round(n * (o.scale ?? 1)));
  return fc.sample(arb, { seed: o.seed, numRuns });
}

/** This function gives a function that names the programs of `list`: by the same object, or else by the same JSON. */
function namer(list: readonly (readonly [string, Expr])[], fallback: string): (expr: Expr) => string {
  const same = new Map<Expr, string>(list.map(([name, e]) => [e, name]));
  const json = new Map<string, string>(list.map(([name, e]) => [JSON.stringify(e), name]));
  return (expr) => same.get(expr) ?? json.get(JSON.stringify(expr)) ?? `${fallback}.?`;
}

/** This function reads each cell of each column of `columns` at each key of a sheet run. */
function readAll(run: SheetRun, columns: Iterable<string>, keys: readonly string[]): void {
  for (const c of columns) for (const k of keys) run.cell(c, k);
}

/** The cases of the programs of `PILOTS`. The programs of a test with a random tuning get the tunings of the test. */
export function pilotCases(o: CaseOptions): ShareCase[] {
  const sheetNames = namer(PILOTS, "sheet");
  return [
    {
      name: "escape",
      run: (m) => {
        const p = m.program("escape", ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS });
        for (const nodes of sample(auditTree, 200, o)) {
          const s = escapeRun(nodes).space;
          for (const origin of s.keys) p.run({ space: s, origin });
        }
      },
    },
    {
      name: "grid",
      run: (m) => {
        const p = m.program("grid", GRID_PROGRAM, { domains: GRID_DOMAINS });
        for (const i of [...sample(gridInput, 200, o), GRID_LINKED]) {
          const { space: s, vars } = gridRun(i);
          for (const origin of s.keys) p.run({ space: s, origin, vars });
        }
      },
    },
    {
      name: "radial",
      run: (m) => {
        const p = m.program("radial", RADIAL_PROGRAM, { domains: RADIAL_DOMAINS });
        for (const i of [...sample(radialRing(5), 20, o), RADIAL_MIXED]) {
          const { space: s, vars } = radialRun(i);
          for (const origin of s.keys) p.run({ space: s, origin, vars });
        }
      },
    },
    {
      name: "layers",
      run: (m) => {
        const p = m.program("layers", LAYERS_PROGRAM, { domains: LAYERS_DOMAINS });
        for (const i of sample(layersInput(5), 20, o)) {
          const { space: s, vars } = layersRun(i);
          for (const origin of s.keys) p.run({ space: s, origin, vars });
        }
      },
    },
    {
      name: "tree",
      run: (m) => {
        const p = m.program("tree", TREE_PROGRAM, { domains: TREE_DOMAINS });
        for (const i of sample(treeInput(4, 3), 20, o)) {
          const { space: s, vars } = treeRun(i);
          for (const origin of s.keys) p.run({ space: s, origin, vars });
        }
      },
    },
    {
      name: "nodeShape",
      run: (m) => {
        const p = m.program("nodeShape", NODE_SHAPE, { domains: SHAPE_DOMAINS });
        const random = sample(fc.tuple(fc.array(shapeChild, { minLength: 1, maxLength: 6 }), shapeExtent, shapeExtent, bandLimit(4)), 30, o);
        const nodes = [
          ...random.map(([kids, w, h, limit]) => ({ kids, vars: { w, h, limit } })),
          { kids: NODE_FIXED_KIDS, vars: { w: 100, h: 20, limit: 2 } },
          ...NODE_INFINITE.map(([kids, w, h]) => ({ kids, vars: { w, h, limit: MAX_BANDS } })),
        ];
        for (const { kids, vars } of nodes) p.run({ space: space.array(kids.map(childRecord)), origin: "0", vars });
      },
    },
    {
      name: "schema",
      run: (m) => {
        const p = m.program("schema", SCHEMA_PROGRAM, { domains: SCHEMA_DOMAINS });
        const s = space.array([{}]);
        for (const docs of [...sample(schemaDocs, 100, o), SCHEMA_EXAMPLE, [], SCHEMA_DEEP, SCHEMA_ODD_KEYS, schemaSample()]) p.run({ space: s, origin: "0", vars: { docs } });
      },
    },
    {
      name: "force",
      run: (m) => {
        // The test of the module gives random graphs and tunings, and the test of the interpreter gives a fixed graph.
        const runs: [ForceOptions, typeof FORCE_FIXED][] = [...sample(fc.tuple(forceOptions, forceGraph), 50, o), [{ steps: 4, repel: 1, spring: 0.25, center: 0.05 }, FORCE_FIXED]];
        for (const [options, g] of runs) {
          const p = m.program("force", forceProgram(options), { domains: FORCE_DOMAINS });
          const i = forceInput(g.nodes, g.edges);
          const s = space.graph(Object.fromEntries(i.records.map((r) => [r.id, r])), i.edges);
          for (const origin of s.keys) p.run({ space: s, origin, vars: {} });
        }
      },
    },
    {
      name: "heat",
      run: (m) => {
        const runs: [HeatGrid, number, number][] = [...sample(fc.tuple(heatGrid, heatAlpha, heatSteps), 200, o), [HEAT_CENTER, 0.25, 1], [HEAT_CENTER, 0.25, 2]];
        for (const [grid, alpha, steps] of runs) heatVex(grid, alpha, steps, m.program("heat", heatStep(alpha).expr, { domains: [NumDomain] }));
      },
    },
    {
      name: "measure",
      run: (m) => {
        const compile = m.compiler(sheetNames);
        for (const [children, vars] of sample(fc.tuple(fc.array(fitChild, { minLength: 1, maxLength: 6 }), measureVars), 40, o)) {
          const s = measureSpace(measureRecords(children));
          readAll(new SheetRun(MEASURE_COLUMNS, { space: s, domains: MEASURE_DOMAINS, vars: { ...vars }, compile }), MEASURE_COLUMNS.keys(), s.keys);
        }
      },
    },
    {
      name: "place",
      run: (m) => {
        const compile = m.compiler(sheetNames);
        for (const { records, vars } of sample(placeTreeInput(12), 30, o)) {
          const s = placeSpace(records);
          readAll(new SheetRun(PLACE_COLUMNS, { space: s, domains: PLACE_DOMAINS, vars: { ...vars }, compile }), PLACE_COLUMNS.keys(), s.keys);
        }
      },
    },
    {
      name: "shapes",
      run: (m) => {
        const compile = m.compiler(sheetNames);
        const runs: [readonly ShapeRecord[], number][] = [...sample(fc.tuple(shapeTree(6), bandLimit(4)), 20, o), [SHAPES_INFINITE, MAX_BANDS]];
        for (const [records, limit] of runs) {
          const s = shapeSpace(records);
          readAll(new SheetRun(SHAPE_COLUMNS, { space: s, domains: SHAPE_DOMAINS, vars: { limit }, compile }), SHAPE_COLUMNS.keys(), s.keys);
        }
      },
    },
    {
      name: "bom",
      run: (m) => {
        const compile = m.compiler(sheetNames);
        const runs: (readonly Part[])[] = [...sample(bomProduct, 200, o), BOM_BIKE, BOM_BROKEN];
        for (const parts of runs) {
          const cells = bomFormula(parts, compile);
          for (const p of parts) for (const c of BOM_COLUMNS) cells(p.id, c);
        }
      },
    },
    {
      name: "grades",
      run: (m) => {
        const compile = m.compiler(sheetNames);
        const read = (classes: readonly SchoolClass[], classRows: boolean): void => {
          const cells = gradeFormula(classes, compile);
          for (const c of classes) {
            const keys = [...(classRows ? [c.name] : []), ...c.students.map((s) => studentKey(c.name, s.name))];
            for (const k of keys) for (const col of GRADE_COLUMNS) cells(k, col);
          }
        };
        for (const classes of sample(gradeSchool, 200, o)) read(classes, false);
        // The fixed test also reads the cells of a class row.
        read(GRADE_CLASSES, true);
      },
    },
    {
      name: "invoice",
      run: (m) => {
        const compile = m.compiler(sheetNames);
        const runs: (readonly Invoice[])[] = [...sample(invoiceList, 200, o), [INVOICE_GOOD], [INVOICE_BAD]];
        for (const list of runs) {
          const cells = invoiceFormula(list, compile);
          for (const inv of list) {
            for (const c of INVOICE_COLUMNS) cells(inv.id, c);
            inv.lines.forEach((_l, i) => {
              for (const c of LINE_COLUMNS) cells(lineKey(inv.id, i), c);
            });
          }
        }
      },
    },
    {
      name: "loan",
      run: (m) => {
        const runs: [readonly LoanMonth[], LoanTerms][] = [...sample(fc.tuple(fc.array(loanMonth, { minLength: 1, maxLength: 60 }), loanTerms), 200, o), [LOAN_FOUR.months, LOAN_FOUR.terms], [LOAN_LONG.months, LOAN_LONG.terms]];
        for (const [months, terms] of runs) {
          // The terms are literals of the formulas, so the names come from the formulas of these terms.
          const cells = loanFormula(months, terms, m.compiler(namer(formulas("loan", ["payment", "extra"], loanFormulas(terms)), "loan")));
          months.forEach((_m, i) => {
            for (const c of LOAN_COLUMNS) cells(String(i), c);
          });
        }
      },
    },
  ];
}

/**
 * The cases of the example sheets of the sheet app: one case for each example. As in `examples.test.ts`, each table of
 * the book shows once, and the run reads each cell. A program has the name `sheet.<example>.<table>.<column>`.
 */
export function sheetCases(): ShareCase[] {
  return EXAMPLES.map((ex) => ({
    name: `sheet.${ex.id}`,
    run: (m) => {
      const book = exampleBook(ex);
      // The text of each formula column gives its name. The first column with a text keeps the name.
      const byText = new Map<string, string>();
      for (const t of book.tables) {
        for (const c of t.columns) if (c.kind === "formula" && !byText.has(c.formula)) byText.set(c.formula, `${t.title}.${c.name}`);
      }
      const names = new Map<Expr, string>();
      const compiler: Compiler = {
        compile: (text, ctx) => {
          const r = compileFormula(text, ctx);
          if (r.ok && !names.has(r.expr)) names.set(r.expr, byText.get(text) ?? text);
          return r;
        },
        toVexChain,
        domains: FORMULA_DOMAINS,
        compileProgram: m.compiler((e) => `sheet.${ex.id}.${names.get(e) ?? "?"}`),
      };
      book.tables.forEach((table, i) => {
        const ev = evaluateBook(showTable(book, i), compiler);
        for (const r of table.rows) for (const c of table.columns) ev.cell(r.id, c.id);
      });
    },
  }));
}

/** This function gives all the cases: the cases of the pilots, then the cases of the example sheets. */
export const shareCases = (o: CaseOptions): ShareCase[] => [...pilotCases(o), ...sheetCases()];
