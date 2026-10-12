/**
 * The reference of a sheet run: the recursive form of the search, as `SheetRun` was before SHEET.DEEP. It reads a
 * cell with a recursive call, so it needs a deep call stack for a long chain of cells. The tests compare `SheetRun`
 * with it on small random sheets, where the depth is not a problem.
 */
import { evaluate, fail, isMove, resolveAddr, vexError, type Addr, type Expr, type ExtHandler, type Result, type SheetOptions } from "@mark1russell7/vex";

interface Visit {
  readonly index: number;
  low: number;
  reread: boolean;
  result: Result<unknown>;
}

const cycleError = (column: string, key: string): Result<never> =>
  fail(vexError("cycle", `the cell "${column}" at "${key}" is on a cycle of cell references`, { origin: key, focus: key }));

const isCellRef = (u: unknown): u is { readonly column: string; readonly at: Addr } =>
  typeof u === "object" && u !== null && typeof (u as { column?: unknown }).column === "string" && Array.isArray((u as { at?: unknown }).at) && (u as { at: readonly unknown[] }).at.every(isMove);

/** A sheet run with recursion: the depth-first search of Tarjan, one recursive call for each read of a cell. */
export class ReferenceSheetRun {
  readonly #columns: ReadonlyMap<string, Expr>;
  readonly #opts: SheetOptions;
  readonly #done = new Map<string, Result<unknown>>();
  readonly #visits = new Map<string, Visit>();
  readonly #stack: { readonly id: string; readonly column: string; readonly key: string; readonly visit: Visit }[] = [];
  #top: Visit = { index: -1, low: -1, reread: false, result: cycleError("", "") };
  #next = 0;

  constructor(columns: ReadonlyMap<string, Expr>, opts: SheetOptions) {
    this.#columns = columns;
    const handler: ExtHandler = (data, ctx) => {
      if (!isCellRef(data)) return fail(vexError("bad-expression", "a cell reference needs a column name and an address", { path: ctx.path }));
      const where = resolveAddr(ctx.space, ctx.position, data.at);
      return where.ok ? this.cell(data.column, where.value) : fail({ ...where.error, path: ctx.path });
    };
    this.#opts = { ...opts, extensions: { ...opts.extensions, "vex.cell": handler } };
  }

  /** This method gives the result of the column `column` at the key `key`. */
  cell(column: string, key: string): Result<unknown> {
    const id = `${column}\u0000${key}`;
    const done = this.#done.get(id);
    if (done !== undefined) return done;
    const caller = this.#top;
    const seen = this.#visits.get(id);
    if (seen !== undefined) {
      caller.low = Math.min(caller.low, seen.index);
      seen.reread = true;
      return cycleError(column, key);
    }
    const program = this.#columns.get(column);
    if (program === undefined) return fail(vexError("unbound", `the sheet has no column "${column}"`, { origin: key, focus: key }));
    const n = this.#next++;
    const visit: Visit = { index: n, low: n, reread: false, result: cycleError(column, key) };
    this.#visits.set(id, visit);
    this.#stack.push({ id, column, key, visit });
    this.#top = visit;
    visit.result = evaluate(program, { ...this.#opts, origin: key });
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
