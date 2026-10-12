/**
 * Sheets: named columns of formulas over a space. A formula can read a column at an address, like a cell
 * reference of a spreadsheet. A cell is one column at one key. A run evaluates each cell once, and each cell on a
 * cycle of reads gives `#CYCLE!`.
 *
 * A cell reference is the extension node `ext("vex.cell", { column, at })`. Thus the IR has no new kind, and the
 * JSON form, `deps` and the traces work without a change.
 */
import { vexError } from "./errors.ts";
import { evaluate, explain, type EvalOptions, type ExtHandler } from "./evaluate.ts";
import { ext, isMove, type Addr, type Expr } from "./ir.ts";
import { fail, type Result } from "./result.ts";
import { resolveAddr } from "./space.ts";
import type { Trace } from "./trace.ts";

/** The extension kind of a cell reference. */
export const CELL_KIND = "vex.cell";

/** The data of a cell reference: the column, and the address from the focus. */
export interface CellRef {
  readonly column: string;
  readonly at: Addr;
}

/** This function makes a cell reference: the column `column` at the address `at` from the focus. */
export const cell = (column: string, at: Addr = []): Expr => ext(CELL_KIND, { column, at } satisfies CellRef);

const isCellRef = (u: unknown): u is CellRef =>
  typeof u === "object" &&
  u !== null &&
  typeof (u as { column?: unknown }).column === "string" &&
  Array.isArray((u as { at?: unknown }).at) &&
  (u as { at: readonly unknown[] }).at.every(isMove);

/** The options of a sheet run: the evaluation options without the origin and the trace. */
export type SheetOptions = Omit<EvalOptions, "origin" | "trace">;

const cycleError = (column: string, key: string): Result<never> =>
  fail(vexError("cycle", `the cell "${column}" at "${key}" is on a cycle of cell references`, { origin: key, focus: key }));

/**
 * One run of a sheet. It keeps the result of each cell that it evaluated. The space does not change, so a cell has
 * one result in a run.
 *
 * The run is a depth-first search with the algorithm of Tarjan for strongly connected components. A cell finishes
 * when its component finishes. Each cell of a component with two or more cells, or with a reference to itself,
 * gives `#CYCLE!`. A read of a cell that is not finished gives `#CYCLE!` too. Thus the order of the evaluations
 * does not change a result, also when `ifError` catches the error of a cycle.
 */
/** The state of one cell in the search. */
interface Visit {
  readonly id: string;
  readonly column: string;
  readonly key: string;
  readonly index: number;
  low: number;
  reread: boolean;
  result: Result<unknown>;
}

export class SheetRun {
  readonly #columns: ReadonlyMap<string, Expr>;
  readonly #opts: SheetOptions;
  readonly #done = new Map<string, Result<unknown>>();
  // The cells on the stack of the search: started, but their component is not finished.
  readonly #visits = new Map<string, Visit>();
  // Stryker disable next-line ArrayDeclaration: the search never reads below the root of a component
  readonly #stack: Visit[] = [];
  // The cell whose formula is in evaluation. At the top level, it is a placeholder that is not a cell.
  // Stryker disable next-line all: the placeholder is not a cell, so the search reads none of its fields
  #top: Visit = { id: "", column: "", key: "", index: -1, low: -1, reread: false, result: cycleError("", "") };
  #next = 0;

  constructor(columns: ReadonlyMap<string, Expr>, opts: SheetOptions) {
    this.#columns = columns;
    this.#opts = { ...opts, extensions: { ...opts.extensions, [CELL_KIND]: this.#handler } };
  }

  readonly #handler: ExtHandler = (data, ctx) => {
    if (!isCellRef(data)) return fail(vexError("bad-expression", "a cell reference needs a column name and an address", { path: ctx.path }));
    const where = resolveAddr(ctx.space, ctx.position, data.at);
    if (!where.ok) return fail({ ...where.error, path: ctx.path });
    return this.cell(data.column, where.value);
  };

  /** This method gives the result of one cell: the column `column` at the key `key`. */
  cell(column: string, key: string): Result<unknown> {
    const id = `${column}\u0000${key}`;
    const done = this.#done.get(id);
    if (done !== undefined) return done;
    const caller = this.#top;
    const seen = this.#visits.get(id);
    if (seen !== undefined) {
      // A read of a cell that is not finished: the caller and this cell are on one cycle. The cell is on the
      // stack of the search, so it is in the component of the caller. Thus a component with one cell is cyclic
      // only if that cell reads itself.
      caller.low = Math.min(caller.low, seen.index);
      seen.reread = true;
      return cycleError(column, key);
    }
    const program = this.#columns.get(column);
    if (program === undefined) return fail(vexError("unbound", `the sheet has no column "${column}"`, { origin: key, focus: key }));

    const n = this.#next++;
    const visit: Visit = { id, column, key, index: n, low: n, reread: false, result: cycleError(column, key) };
    this.#visits.set(id, visit);
    this.#stack.push(visit);
    this.#top = visit;
    visit.result = evaluate(program, { ...this.#opts, origin: key });
    this.#top = caller;

    if (visit.low === visit.index) this.#finish(visit);
    else caller.low = Math.min(caller.low, visit.low);
    return this.#done.get(id) ?? cycleError(column, key);
  }

  /** This method takes the component of `root` from the stack, and sets the final result of each of its cells. */
  #finish(root: Visit): void {
    const members = this.#stack.splice(this.#stack.indexOf(root));
    // A component of two or more cells reads its root again, so root.reread alone decides. The length test is a guard.
    // Stryker disable next-line ConditionalExpression,LogicalOperator: members.length > 1 implies root.reread
    const cyclic = members.length > 1 || root.reread;
    for (const m of members) {
      // Stryker disable next-line CallExpression: a finished cell is in #done, and cell() reads #done first
      this.#visits.delete(m.id);
      this.#done.set(m.id, cyclic ? cycleError(m.column, m.key) : m.result);
    }
  }

  /** This method evaluates one cell with a trace of the nodes of its column. The result is the result of the cell. */
  explain(column: string, key: string): Trace {
    const result = this.cell(column, key);
    const program = this.#columns.get(column);
    if (program === undefined) return { events: [], result };
    return { events: explain(program, { ...this.#opts, origin: key }).events, result };
  }

  /**
   * This method evaluates the column `column` at each key before `key`, in key order. A recurrence over the keys,
   * for example a running total, then reads finished cells and does not go deep into the call stack.
   */
  warm(column: string, key: string): void {
    for (const k of this.#opts.space.keys) {
      if (k === key) return;
      this.cell(column, k);
    }
  }
}
