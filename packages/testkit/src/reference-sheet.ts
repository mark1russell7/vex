/**
 * The reference of a sheet run: the recursive form of the search, as `SheetRun` was before SHEET.DEEP. It reads a
 * cell with a recursive call, so it needs a deep call stack for a long chain of cells. The tests compare `SheetRun`
 * with it on small random sheets, where the depth is not a problem. It has the tables of SHEET.TABLES too.
 */
import { evaluate, fail, isMove, resolveAddr, vexError, type Addr, type CellFormulas, type EvalOptions, type Expr, type ExtHandler, type Result, type SheetOptions, type Space } from "@mark1russell7/vex";

interface Visit {
  readonly index: number;
  low: number;
  reread: boolean;
  result: Result<unknown>;
}

/** A table of the reference run: its name ("" for the main table without a name), its space and its formulas. */
interface Table {
  readonly name: string;
  readonly space: Space;
  readonly columns: ReadonlyMap<string, Expr>;
  readonly cells: CellFormulas;
}

const cycleError = (column: string, key: string): Result<never> =>
  fail(vexError("cycle", `the cell "${column}" at "${key}" is on a cycle of cell references`, { origin: key, focus: key }));

const isCellRef = (u: unknown): u is { readonly column: string; readonly at: Addr } =>
  typeof u === "object" && u !== null && typeof (u as { column?: unknown }).column === "string" && Array.isArray((u as { at?: unknown }).at) && (u as { at: readonly unknown[] }).at.every(isMove);

/** A sheet run with recursion: the depth-first search of Tarjan, one recursive call for each read of a cell. */
export class ReferenceSheetRun {
  readonly #main: Table;
  readonly #tables: readonly Table[];
  readonly #opts: Omit<EvalOptions, "origin" | "trace" | "space">;
  readonly #done = new Map<string, Result<unknown>>();
  readonly #visits = new Map<string, Visit>();
  readonly #stack: { readonly id: string; readonly column: string; readonly key: string; readonly visit: Visit }[] = [];
  #top: Visit = { index: -1, low: -1, reread: false, result: cycleError("", "") };
  #next = 0;

  constructor(columns: ReadonlyMap<string, Expr>, opts: SheetOptions) {
    const { cells, name, tables, space, ...rest } = opts;
    this.#main = { name: name ?? "", space, columns, cells: cells ?? new Map() };
    // The first table of a name wins, and the main table comes first.
    const all: Table[] = [this.#main];
    for (const [n, t] of tables ?? []) if (!all.some((x) => x.name === n)) all.push({ name: n, space: t.space, columns: t.columns, cells: t.cells ?? new Map() });
    this.#tables = all;
    const handler: ExtHandler = (data, ctx) => {
      if (!isCellRef(data)) return fail(vexError("bad-expression", "a cell reference needs a column name and an address", { path: ctx.path }));
      const where = resolveAddr(ctx.space, ctx.position, data.at);
      const table = this.#tables.find((t) => t.space === ctx.space) ?? this.#main;
      return where.ok ? this.#read(table, data.column, where.value) : fail({ ...where.error, path: ctx.path });
    };
    const named = this.#tables.filter((t) => t.name !== "");
    this.#opts = { ...rest, tables: Object.fromEntries(named.map((t) => [t.name, t.space])), extensions: { ...rest.extensions, "vex.cell": handler } };
  }

  /** This method gives the result of the column `column` at the key `key` of the main table, or of the table `table`. */
  cell(column: string, key: string, table?: string): Result<unknown> {
    const t = table === undefined ? this.#main : this.#tables.find((x) => x.name === table);
    if (t === undefined) return fail(vexError("no-table", `the run has no table "${table ?? ""}"`, { origin: key, focus: key }));
    return this.#read(t, column, key);
  }

  #read(t: Table, column: string, key: string): Result<unknown> {
    const id = `${this.#tables.indexOf(t)}\u0001${column}\u0000${key}`;
    const done = this.#done.get(id);
    if (done !== undefined) return done;
    const caller = this.#top;
    const seen = this.#visits.get(id);
    if (seen !== undefined) {
      caller.low = Math.min(caller.low, seen.index);
      seen.reread = true;
      return cycleError(column, key);
    }
    // A cell with its own formula takes that formula, and the other cells take the formula of the column.
    const program = t.cells.get(column)?.get(key) ?? t.columns.get(column);
    if (program === undefined) {
      const where = t === this.#main ? "the sheet" : `the table "${t.name}"`;
      const message = t.cells.has(column) ? `the cell "${column}" at "${key}" has no formula` : `${where} has no column "${column}"`;
      return fail(vexError("unbound", message, { origin: key, focus: key }));
    }
    const n = this.#next++;
    const visit: Visit = { index: n, low: n, reread: false, result: cycleError(column, key) };
    this.#visits.set(id, visit);
    this.#stack.push({ id, column, key, visit });
    this.#top = visit;
    visit.result = evaluate(program, { ...this.#opts, space: t.space, origin: key });
    this.#top = caller;
    if (visit.low === visit.index) {
      const members = this.#stack.splice(this.#stack.findIndex((m) => m.visit === visit));
      const cyclic = members.length > 1 || visit.reread;
      for (const m of members) {
        this.#visits.delete(m.id);
        this.#done.set(m.id, cyclic ? cycleError(m.column, m.key) : m.visit.result);
      }
    } else {
      caller.low = Math.min(caller.low, visit.low);
    }
    return this.#done.get(id) ?? cycleError(column, key);
  }
}
