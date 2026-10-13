/**
 * Sheets: named columns of formulas over a space. A formula can read a column at an address, like a cell
 * reference of a spreadsheet. A cell is one column at one key. A run evaluates each cell once, and each cell on a
 * cycle of reads gives `#CYCLE!`.
 *
 * A cell reference is the extension node `ext("vex.cell", { column, at })`. Thus the IR has no new kind, and the
 * JSON form, `deps` and the traces work without a change.
 *
 * A cell can have its own formula. That formula replaces the formula of the column at the key of the cell. A
 * spreadsheet has the same thing: a cell with a formula that is different from the other formulas of its column.
 */
import { vexError } from "./errors.ts";
import { evaluate, explain, nestingOf, type EvalOptions, type ExtHandler } from "./evaluate.ts";
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

/** The formulas of single cells: for each column, the formula of each key that has its own formula. */
export type CellFormulas = ReadonlyMap<string, ReadonlyMap<string, Expr>>;

/** The options of a sheet run: the evaluation options without the origin and the trace, and the formulas of cells. */
export type SheetOptions = Omit<EvalOptions, "origin" | "trace"> & {
  /** The cells with their own formula. The formula of a cell replaces the formula of its column at its key. */
  readonly cells?: CellFormulas;
};

const cycleError = (column: string, key: string): Result<never> =>
  fail(vexError("cycle", `the cell "${column}" at "${key}" is on a cycle of cell references`, { origin: key, focus: key }));

/** The id of a cell. */
const idOf = (column: string, key: string): string => `${column}\u0000${key}`;

/** The state of one cell in the search. */
interface Visit {
  readonly id: string;
  readonly column: string;
  readonly key: string;
  readonly index: number;
  low: number;
  reread: boolean;
  result: Result<unknown>;
  /** True when the last evaluation paused, because a cell that it reads is not finished. */
  paused: boolean;
  /** The cell that the evaluation waits for: a cell that the run started, or a cell that paused too. */
  need: Visit | undefined;
}

/**
 * The budget of the stack for the recursion of a run, in estimated frames. Each engine has more stack than this, so
 * the recursion of a run cannot fill the stack (SHEET.DEEP).
 */
const STACK_BUDGET = 3000;

/**
 * One run of a sheet. It keeps the result of each cell that it evaluated. The space does not change, so a cell has
 * one result in a run.
 *
 * The run is a depth-first search with the algorithm of Tarjan for strongly connected components. A cell finishes
 * when its component finishes. Each cell of a component with two or more cells, or with a reference to itself,
 * gives `#CYCLE!`. A read of a cell that is not finished gives `#CYCLE!` too. Thus the order of the evaluations
 * does not change a result, also when `ifError` catches the error of a cycle.
 *
 * The search does not depend on the call stack of the engine (SHEET.DEEP). A read of a cell evaluates that cell
 * with recursion while the stack of the run stays in a budget. When a read is over the budget, the run starts the
 * cell, and the cell that reads it pauses. A paused evaluation reads no other cell and changes no state of the
 * search. The run then evaluates the started cell from its own list, and it evaluates the paused cell again after
 * that cell. A formula is pure (EVAL.PURE), so the second evaluation gives the result of one evaluation.
 */
export class SheetRun {
  readonly #columns: ReadonlyMap<string, Expr>;
  readonly #cells: CellFormulas;
  readonly #opts: Omit<EvalOptions, "origin" | "trace">;
  readonly #done = new Map<string, Result<unknown>>();
  // For each column, the number of keys at the start of the key order that a warm-up evaluated.
  readonly #warmed = new Map<string, number>();
  // The position of each key in the key order, made at the first warm-up.
  #index: ReadonlyMap<string, number> | undefined;
  // The cells on the stack of the search: started, but their component is not finished.
  readonly #visits = new Map<string, Visit>();
  // Stryker disable next-line ArrayDeclaration: the search never reads below the root of a component
  readonly #stack: Visit[] = [];
  // The cell whose formula is in evaluation. At the top level, it is a placeholder that is not a cell.
  // Stryker disable next-line all: the placeholder is not a cell, so the search reads none of its fields
  #top: Visit = { id: "", column: "", key: "", index: -1, low: -1, reread: false, result: cycleError("", ""), paused: false, need: undefined };
  #next = 0;
  // The estimated frames of the stack that the evaluations in progress use, and the cost of each program.
  #used = 0;
  readonly #cost = new Map<Expr, number>();
  readonly #budget: number;

  /** `budget` is the budget of the stack in estimated frames. A test can make it small, so the run pauses often. */
  constructor(columns: ReadonlyMap<string, Expr>, opts: SheetOptions, budget: number = STACK_BUDGET) {
    const { cells, ...rest } = opts;
    this.#columns = columns;
    this.#cells = cells ?? new Map();
    this.#budget = budget;
    this.#opts = { ...rest, extensions: { ...rest.extensions, [CELL_KIND]: this.#handler } };
  }

  /** This method gives the program of a cell: its own formula, or the formula of its column (SHEET.CELL.FORMULA). */
  #programOf(column: string, key: string): Expr | undefined {
    // Stryker disable next-line ConditionalExpression: without formulas of cells, the lookup gives undefined anyway
    const own = this.#cells.size === 0 ? undefined : this.#cells.get(column)?.get(key);
    return own ?? this.#columns.get(column);
  }

  /** This method gives the error of a cell without a program. */
  #unbound(column: string, key: string): Result<never> {
    const message = this.#cells.has(column) ? `the cell "${column}" at "${key}" has no formula` : `the sheet has no column "${column}"`;
    return fail(vexError("unbound", message, { origin: key, focus: key }));
  }

  readonly #handler: ExtHandler = (data, ctx) => {
    if (!isCellRef(data)) return fail(vexError("bad-expression", "a cell reference needs a column name and an address", { path: ctx.path }));
    const where = resolveAddr(ctx.space, ctx.position, data.at);
    if (!where.ok) return fail({ ...where.error, path: ctx.path });
    return this.#read(data.column, where.value);
  };

  /**
   * This method gives the result of one cell: the column `column` at the key `key`. A read from a host first evaluates
   * the column at the keys before `key`, in key order. Thus a recurrence over the keys reads finished cells.
   */
  cell(column: string, key: string): Result<unknown> {
    // The placeholder at the top has the index -1. A read inside a formula has a cell at the top, so it does not warm.
    if (this.#top.index >= 0) return this.#read(column, key);
    this.#warmTo(column, key);
    return this.#drive(column, key);
  }

  /** This method evaluates the column `column` at each key before `key` that it did not evaluate before, in key order. */
  #warmTo(column: string, key: string): void {
    if (!this.#columns.has(column)) return;
    const keys = this.#opts.space.keys;
    this.#index ??= new Map(keys.map((k, i) => [k, i]));
    const end = this.#index.get(key) ?? 0;
    const start = this.#warmed.get(column) ?? 0;
    for (let i = start; i < end; i++) this.#drive(column, keys[i] ?? key);
    if (end > start) this.#warmed.set(column, end);
  }

  /** This method gives the estimated frames of the stack that one evaluation of the program `program` uses. */
  #costOf(program: Expr): number {
    let cost = this.#cost.get(program);
    if (cost === undefined) {
      cost = 3 * nestingOf(program) + 16;
      this.#cost.set(program, cost);
    }
    return cost;
  }

  /** This method puts a new cell on the stack of the search. */
  #start(column: string, key: string): Visit {
    const n = this.#next++;
    const visit: Visit = { id: idOf(column, key), column, key, index: n, low: n, reread: false, result: cycleError(column, key), paused: false, need: undefined };
    this.#visits.set(visit.id, visit);
    this.#stack.push(visit);
    return visit;
  }

  /** This method evaluates the formula of a cell once. When the evaluation pauses, the result of the cell does not change. */
  #evaluate(visit: Visit, program: Expr): void {
    const caller = this.#top;
    const cost = this.#costOf(program);
    visit.paused = false;
    visit.need = undefined;
    this.#top = visit;
    this.#used += cost;
    const result = evaluate(program, { ...this.#opts, origin: visit.key });
    this.#used -= cost;
    this.#top = caller;
    if (!visit.paused) visit.result = result;
  }

  /** This method ends a cell whose evaluation did not pause: it finishes its component, or it gives its low to the caller. */
  #end(visit: Visit, caller: Visit | undefined): void {
    if (visit.low === visit.index) this.#finish(visit);
    else if (caller !== undefined) caller.low = Math.min(caller.low, visit.low);
  }

  /** This method reads a cell from the formula of the cell at the top. */
  #read(column: string, key: string): Result<unknown> {
    const id = idOf(column, key);
    const done = this.#done.get(id);
    if (done !== undefined) return done;
    const caller = this.#top;
    // A paused evaluation reads no other cell, so it does not follow a path that its final evaluation does not follow.
    if (caller.paused) return cycleError(column, key);
    const seen = this.#visits.get(id);
    if (seen !== undefined) {
      // A read of a cell that is not finished: the caller and this cell are on one cycle. The cell is on the
      // stack of the search, so it is in the component of the caller. Thus a component with one cell is cyclic
      // only if that cell reads itself.
      caller.low = Math.min(caller.low, seen.index);
      seen.reread = true;
      return cycleError(column, key);
    }
    const program = this.#programOf(column, key);
    if (program === undefined) return this.#unbound(column, key);
    const visit = this.#start(column, key);
    if (this.#used + this.#costOf(program) > this.#budget) {
      // Over the budget: the caller pauses, and the run evaluates the new cell from its own list.
      caller.paused = true;
      caller.need = visit;
      return cycleError(column, key);
    }
    this.#evaluate(visit, program);
    if (visit.paused) {
      caller.paused = true;
      caller.need = visit;
      return cycleError(column, key);
    }
    this.#end(visit, caller);
    return this.#done.get(id) ?? cycleError(column, key);
  }

  /** This method evaluates a cell from the top level. The cells that pause go on a list, not on the call stack. */
  #drive(column: string, key: string): Result<unknown> {
    const id = idOf(column, key);
    const done = this.#done.get(id);
    if (done !== undefined) return done;
    if (this.#programOf(column, key) === undefined) return this.#unbound(column, key);
    const work: Visit[] = [this.#start(column, key)];
    for (let visit = work.at(-1); visit !== undefined; visit = work.at(-1)) {
      const program = this.#programOf(visit.column, visit.key);
      /* v8 ignore next -- @preserve: a visit exists only for a cell with a program */
      if (program === undefined) break;
      this.#evaluate(visit, program);
      if (visit.paused) {
        // The cells that the evaluation waits for go on the list, the last one on the top.
        for (let need = visit.need; need !== undefined; need = need.need) work.push(need);
        continue;
      }
      work.pop();
      this.#end(visit, work.at(-1));
    }
    return this.#done.get(id) ?? cycleError(column, key);
  }

  /** This method takes the component of `root` from the stack, and sets the final result of each of its cells. */
  #finish(root: Visit): void {
    // The root is near the top of the stack, so the search starts at the top: a deep chain needs no long scan.
    const members = this.#stack.splice(this.#stack.lastIndexOf(root));
    // A component of two or more cells reads its root again, so root.reread alone decides. The length test is a guard.
    // Stryker disable next-line ConditionalExpression,LogicalOperator: members.length > 1 implies root.reread
    const cyclic = members.length > 1 || root.reread;
    for (const m of members) {
      // Stryker disable next-line CallExpression: a finished cell is in #done, and cell() reads #done first
      this.#visits.delete(m.id);
      this.#done.set(m.id, cyclic ? cycleError(m.column, m.key) : m.result);
    }
  }

  /** This method evaluates one cell with a trace of the nodes of its program. The result is the result of the cell. */
  explain(column: string, key: string): Trace {
    const result = this.cell(column, key);
    const program = this.#programOf(column, key);
    if (program === undefined) return { events: [], result };
    return { events: explain(program, { ...this.#opts, origin: key }).events, result };
  }

  /**
   * This method evaluates the column `column` at each key before `key`, in key order. A recurrence over the keys,
   * for example a running total, then reads finished cells.
   */
  warm(column: string, key: string): void {
    this.#warmTo(column, key);
  }
}
