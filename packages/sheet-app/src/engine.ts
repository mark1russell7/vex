/**
 * The engine of the sheet app. It makes a tree space from the rows, compiles each formula column to the IR, and
 * evaluates the cells with a `SheetRun`. Thus a cycle of formula columns gives `#CYCLE!`, and the other cells stay
 * correct. The engine takes the compiler as an argument, so the app depends only on the contract of the compiler.
 */
import { fail, lit, ok, SheetRun, space, vexError, type AnyDomain, type Expr, type Result, type SheetOptions, type Trace } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, DateDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import { activeOf, bookOf, type Book } from "./book.ts";
import type { Column, SheetDoc } from "./doc.ts";
import { parseValue } from "./values.ts";

/** The kind of a cell of a grid that is not empty: a value of a kind, or a formula. */
export type GridCellKind = "number" | "boolean" | "text" | "date" | "formula";

/** The cells of a grid, for the addresses and the ranges of the formulas. Refer to `spec/formula.md` §7. */
export interface GridContext {
  readonly columns: readonly string[];
  readonly rows: readonly string[];
  readonly cells: ReadonlyMap<string, GridCellKind>;
}

/**
 * This function reads the text of a cell of a grid that is not a formula. The value is a number, `TRUE` or `FALSE`, a
 * date like 2026-10-13, or else the text itself.
 */
export function gridLiteral(text: string): { readonly kind: Exclude<GridCellKind, "formula">; readonly value: unknown } {
  const t = text.trim();
  if (/^(true|false)$/i.test(t)) return { kind: "boolean", value: t.toLowerCase() === "true" };
  for (const kind of ["number", "date"] as const) {
    const p = parseValue(kind, t);
    if (p.kind === "ok") return { kind, value: p.value };
  }
  return { kind: "text", value: text };
}

/** This function gives the context of the grid of a document: the letters, the rows and the kind of each cell. */
export function gridOf(doc: SheetDoc): GridContext {
  const cells = new Map<string, GridCellKind>();
  doc.rows.forEach((r, i) => {
    for (const c of doc.columns) {
      const text = r.formulas?.[c.id];
      if (text !== undefined && text.trim() !== "") cells.set(`${c.name}${i + 1}`, text.trimStart().startsWith("=") ? "formula" : gridLiteral(text).kind);
    }
  });
  return { columns: doc.columns.map((c) => c.name), rows: doc.rows.map((r) => r.id), cells };
}

/** The names that a formula can read: the value columns are fields, and the formula columns are cells. */
export interface FormulaContext {
  readonly valueColumns: readonly string[];
  readonly formulaColumns: readonly string[];
  /** The keys of the rows with each name, for `row("name")`. */
  readonly rowNames?: ReadonlyMap<string, readonly string[]>;
  /** The cells of a grid. A table has no grid. */
  readonly grid?: GridContext;
  /** The tables of the book, by title, for `table("title")`. */
  readonly tables?: ReadonlyMap<string, TableContext>;
}

/** The columns and the rows of a table, for the formulas of the other tables. Refer to `spec/formula.md` §8. */
export interface TableContext {
  readonly valueColumns: readonly string[];
  readonly formulaColumns: readonly string[];
  readonly rowNames?: ReadonlyMap<string, readonly string[]>;
  readonly nameColumn?: string;
}

/** This function gives the context of a table for the formulas of the other tables. */
export function tableContextOf(doc: SheetDoc): TableContext {
  const first = doc.columns[0];
  return {
    valueColumns: doc.columns.filter((c) => c.kind === "value").map((c) => c.name),
    formulaColumns: doc.columns.filter((c) => c.kind === "formula").map((c) => c.name),
    rowNames: rowNamesOf(doc),
    ...(first?.kind === "value" && first.type === "text" ? { nameColumn: first.name } : {}),
  };
}

/** A problem of a formula, with its position in the text. */
export interface FormulaError {
  readonly message: string;
  readonly span: { readonly start: number; readonly end: number };
}

/** The result of the compiler: the IR and the columns that the formula reads, or an error. */
export type CompileResult = { readonly ok: true; readonly expr: Expr; readonly reads: readonly string[] } | { readonly ok: false; readonly error: FormulaError };

/** A piece of a highlighted formula. */
export interface FormulaPiece {
  readonly kind: string;
  readonly text: string;
}

/** A function of the formula language, for completion. */
export interface FunctionInfo {
  readonly name: string;
  readonly signature: string;
  readonly summary: string;
}

/**
 * The contract of the formula compiler (`@vex/formula`). The editor uses `highlight` and `functions` if they exist.
 * `domains` are the domains that the formulas need. Without it, the engine uses `DOMAINS`.
 */
export interface Compiler {
  readonly domains?: readonly AnyDomain[];
  /**
   * The compiler of the IR into a program, for example `tiered` of `@mark1russell7/vex-compiler` (SHEET.COMPILE). Without
   * it, the interpreter evaluates each formula.
   */
  readonly compileProgram?: SheetOptions["compile"];
  readonly compile: (text: string, ctx: FormulaContext) => CompileResult;
  readonly toVexChain: (expr: Expr) => string;
  readonly highlight?: (text: string) => readonly FormulaPiece[];
  readonly functions?: readonly FunctionInfo[];
}

/** The domains of the app. */
export const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, Vec2Domain, ColorDomain, AngleDomain, DateDomain];

/** The evaluation of a document. */
export interface Evaluation {
  /** The result of one cell. An empty value cell gives `undefined`. */
  readonly cell: (rowId: string, columnId: string) => Result<unknown> | undefined;
  /** The compile result of each formula column, by column id. */
  readonly compiled: ReadonlyMap<string, CompileResult>;
  /** The compile result of the formula of one cell: its own formula, or the formula of its column. */
  readonly compiledCell: (rowId: string, columnId: string) => CompileResult | undefined;
  /** The steps of one formula cell. */
  readonly explain: (rowId: string, columnId: string) => Trace | undefined;
  /** The number of cells with an error value. */
  readonly errors: number;
}

/**
 * This function gives the keys of the rows with each name. The name of a row is the text of its first column, when
 * that column is a text column. An empty text is not a name.
 */
export function rowNamesOf(doc: SheetDoc): ReadonlyMap<string, readonly string[]> {
  const names = new Map<string, string[]>();
  const first = doc.columns[0];
  if (first?.kind !== "value" || first.type !== "text") return names;
  for (const r of doc.rows) {
    const name = (r.cells[first.id] ?? "").trim();
    if (name !== "") names.set(name, [...(names.get(name) ?? []), r.id]);
  }
  return names;
}

/** A table, ready for a run: its space, the programs of its columns and of its cells, and the compile results. */
interface Prepared {
  readonly space: ReturnType<typeof space.tree>;
  readonly compiled: ReadonlyMap<string, CompileResult>;
  readonly programs: ReadonlyMap<string, Expr>;
  readonly own: ReadonlyMap<string, CompileResult>;
  readonly cells: ReadonlyMap<string, ReadonlyMap<string, Expr>>;
}

/** The most compile results that the cache of a compiler keeps. A full cache starts again empty. */
const CACHE_LIMIT = 2000;

/**
 * The compile results of each compiler, by the text of the formula and its context. A formula that does not change
 * keeps its IR object across evaluations, so a run can use its compiled program again (SHEET.COMPILE).
 */
const RESULTS = new WeakMap<Compiler, Map<string, CompileResult>>();

/** This function gives the text of a context, for the key of a compile result. */
const contextText = (ctx: FormulaContext): string =>
  JSON.stringify(ctx, (_k, x: unknown) => (x instanceof Map ? [...(x as ReadonlyMap<unknown, unknown>)] : x));

/** This function compiles a formula, or it gives the result of an earlier compile of the same text in the same context. */
function compileCached(compiler: Compiler, text: string, ctx: FormulaContext, ctxText: string): CompileResult {
  let results = RESULTS.get(compiler);
  if (results === undefined) {
    results = new Map();
    RESULTS.set(compiler, results);
  }
  const key = `${ctxText}\u0000${text}`;
  let result = results.get(key);
  if (result === undefined) {
    result = compiler.compile(text, ctx);
    if (results.size >= CACHE_LIMIT) results.clear();
    results.set(key, result);
  }
  return result;
}

/** This function makes the space of a table and compiles its formulas. `tables` are the tables of the book. */
function prepare(doc: SheetDoc, compiler: Compiler, tables: ReadonlyMap<string, TableContext>): Prepared {
  const valueCols = doc.columns.filter((c): c is Extract<Column, { kind: "value" }> => c.kind === "value");
  const formulaCols = doc.columns.filter((c): c is Extract<Column, { kind: "formula" }> => c.kind === "formula");
  // A cell whose text is not a value of its type keeps its text, so a formula that reads it gives an error value.
  // Object.fromEntries gives an own field for each key. An assignment of the key "__proto__" changes the prototype, so a
  // row with that id or a column with that name was lost.
  const records: Record<string, Record<string, unknown>> = Object.fromEntries(
    doc.rows.map((r) => [
      r.id,
      Object.fromEntries(
        valueCols.flatMap((c) => {
          const p = parseValue(c.type, r.cells[c.id] ?? "");
          return p.kind === "ok" ? [[c.name, p.value]] : p.kind === "bad" ? [[c.name, r.cells[c.id]]] : [];
        }),
      ),
    ]),
  );
  const parents: Record<string, string | null> = Object.fromEntries(doc.rows.map((r) => [r.id, r.parent]));
  const sp = space.tree(records, parents);
  const grid = doc.mode === "grid" ? gridOf(doc) : undefined;
  const ctx: FormulaContext = {
    valueColumns: valueCols.map((c) => c.name),
    formulaColumns: formulaCols.map((c) => c.name),
    rowNames: rowNamesOf(doc),
    tables,
    ...(grid === undefined ? {} : { grid }),
  };
  const ctxText = contextText(ctx);
  const compiled = new Map<string, CompileResult>(formulaCols.map((c) => [c.id, compileCached(compiler, c.formula, ctx, ctxText)]));
  const programs = new Map<string, Expr>();
  for (const c of formulaCols) {
    const r = compiled.get(c.id);
    if (r?.ok === true) programs.set(c.name, r.expr);
  }
  // The cells with their own formula: the compile result by row and column, and the programs for the run.
  const own = new Map<string, CompileResult>();
  const cells = new Map<string, Map<string, Expr>>();
  for (const r of doc.rows) {
    for (const c of formulaCols) {
      const text = r.formulas?.[c.id];
      if (text === undefined) continue;
      // In a grid, a text that does not start with "=" is a value, not a formula.
      const result: CompileResult = grid !== undefined && !text.trimStart().startsWith("=") ? { ok: true, expr: lit(gridLiteral(text).value), reads: [] } : compileCached(compiler, text, ctx, ctxText);
      own.set(`${r.id}\u0000${c.id}`, result);
      if (result.ok) cells.set(c.name, new Map([...(cells.get(c.name) ?? []), [r.id, result.expr]]));
    }
  }
  return { space: sp, compiled, programs, own, cells };
}

/** This function evaluates each cell of a document with one table. */
export const evaluateDoc = (doc: SheetDoc, compiler: Compiler): Evaluation => evaluateBook(bookOf(doc), compiler);

/**
 * This function evaluates each cell of the table on the screen of a book. One run has all the tables, so a formula
 * reads another table with `table("title")`, and a cycle across tables gives `#CYCLE!`. When two tables have one
 * title, the first one has the title.
 */
export function evaluateBook(book: Book, compiler: Compiler): Evaluation {
  const doc = activeOf(book);
  const contexts = new Map<string, TableContext>();
  for (const t of book.tables) if (!contexts.has(t.title)) contexts.set(t.title, tableContextOf(t));
  const prepared = book.tables.map((t) => prepare(t, compiler, contexts));
  const { space: sp, compiled, programs, own, cells } = prepared[book.active] ?? prepare(doc, compiler, contexts);
  const others = new Map(
    book.tables.flatMap((t, i) => {
      const p = prepared[i];
      const first = book.tables.findIndex((x) => x.title === t.title) === i;
      return i === book.active || !first || p === undefined ? [] : [[t.title, { space: p.space, columns: p.programs, cells: p.cells }] as const];
    }),
  );
  const run = new SheetRun(programs, {
    space: sp,
    domains: compiler.domains ?? DOMAINS,
    cells,
    name: doc.title,
    tables: others,
    ...(compiler.compileProgram === undefined ? {} : { compile: compiler.compileProgram }),
  });
  // The app shows each cell of the table, so a fill evaluates them in the order of their reads first (SHEET.FILL).
  run.fill();
  const byId = new Map(doc.columns.map((c) => [c.id, c]));
  const cache = new Map<string, Result<unknown> | undefined>();

  const cell = (rowId: string, columnId: string): Result<unknown> | undefined => {
    const key = `${rowId}\u0000${columnId}`;
    if (cache.has(key)) return cache.get(key);
    const col = byId.get(columnId);
    let out: Result<unknown> | undefined;
    if (col === undefined || !sp.has(rowId)) out = undefined;
    else if (col.kind === "value") {
      const p = parseValue(col.type, doc.rows.find((r) => r.id === rowId)?.cells[col.id] ?? "");
      out = p.kind === "empty" ? undefined : p.kind === "ok" ? ok(p.value) : fail(vexError("kind-mismatch", p.reason, { origin: rowId, focus: rowId }));
    } else {
      const mine = own.get(key);
      const c = mine ?? compiled.get(col.id);
      if (c === undefined || (mine === undefined && col.formula.trim() === "")) out = undefined;
      else if (c.ok) out = run.cell(col.name, rowId);
      else {
        const whose = mine === undefined ? `the formula of "${col.name}"` : `the formula of this cell of "${col.name}"`;
        out = fail(vexError("bad-expression", `${whose} has an error: ${c.error.message}`, { origin: rowId, focus: rowId }));
      }
    }
    cache.set(key, out);
    return out;
  };

  let errors = 0;
  for (const r of doc.rows) for (const c of doc.columns) if (cell(r.id, c.id)?.ok === false) errors++;

  const compiledCell = (rowId: string, columnId: string): CompileResult | undefined => own.get(`${rowId}\u0000${columnId}`) ?? compiled.get(columnId);

  const explain = (rowId: string, columnId: string): Trace | undefined => {
    const col = byId.get(columnId);
    if (col?.kind !== "formula" || compiledCell(rowId, col.id)?.ok !== true || !sp.has(rowId)) return undefined;
    return run.explain(col.name, rowId);
  };

  return { cell, compiled, compiledCell, explain, errors };
}
