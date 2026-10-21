/**
 * The reference of a sheet run: the recursive form of the search, as `SheetRun` was before SHEET.DEEP. It reads a
 * cell with a recursive call, so it needs a deep call stack for a long chain of cells. The tests compare `SheetRun`
 * with it on small random sheets, where the depth is not a problem. It has the tables of SHEET.TABLES too. The kernel of
 * coeval evaluates each formula (EVAL.REFERENCE), so the reference shares no code of evaluation with `SheetRun`.
 */
import { fail, isMove, kernelPlan, resolveAddr, vexError, type CellFormulas, type CompileOptions, type Expr, type ExtHandler, type FixedMove, type KernelPlan, type Result, type SheetOptions, type Space } from "@mark1russell7/vex";

interface Visit {
  readonly index: number;
  low: number;
  reread: boolean;
  result: Result<unknown>;
}

/** A table of the reference run: the words for it in a message, its space and its formulas. */
interface Table {
  readonly where: string;
  readonly space: Space;
  readonly columns: ReadonlyMap<string, Expr>;
  readonly cells: CellFormulas;
  /** The result of each finished cell, by column and key. */
  readonly done: Map<string, Map<string, Result<unknown>>>;
  /** The cells on the stack of the search, by column and key. */
  readonly visits: Map<string, Map<string, Visit>>;
}

/** This function gives the entry of a cell in a map of the column and then the key. */
const entryOf = <T>(m: ReadonlyMap<string, ReadonlyMap<string, T>>, column: string, key: string): T | undefined => m.get(column)?.get(key);

/** This function sets the entry of a cell in a map of the column and then the key. */
function setEntry<T>(m: Map<string, Map<string, T>>, column: string, key: string, value: T): void {
  let inner = m.get(column);
  if (inner === undefined) {
    inner = new Map();
    m.set(column, inner);
  }
  inner.set(key, value);
}

/** This function gives the state of a table at the start of a run. */
const tableOf = (where: string, space: Space, columns: ReadonlyMap<string, Expr>, cells: CellFormulas | undefined): Table => ({ where, space, columns, cells: cells ?? new Map(), done: new Map(), visits: new Map() });

const cycleError = (column: string, key: string): Result<never> =>
  fail(vexError("cycle", `the cell "${column}" at "${key}" is on a cycle of cell references`, { origin: key, focus: key }));

/** This function tells if a value is a move with no expression. */
const isFixed = (m: unknown): boolean => isMove(m) && (m.t === "key" ? typeof m.key === "string" : m.t !== "index" || typeof m.i === "number");

/** A cell reference has a column and an address of fixed moves: a computed move is an expression, not data. */
const isCellRef = (u: unknown): u is { readonly column: string; readonly at: readonly FixedMove[] } => {
  const r = u as { readonly column?: unknown; readonly at?: unknown } | null | undefined;
  return typeof r?.column === "string" && Array.isArray(r.at) && (r.at as readonly unknown[]).every(isFixed);
};

/** A sheet run with recursion: the depth-first search of Tarjan, one recursive call for each read of a cell. */
export class ReferenceSheetRun {
  readonly #main: Table;
  readonly #byName = new Map<string, Table>();
  // The table of each space. The first table of a space keeps it.
  readonly #bySpace = new Map<Space, Table>();
  readonly #compile: CompileOptions;
  readonly #tables: Readonly<Record<string, Space>>;
  readonly #vars: Readonly<Record<string, unknown>> | undefined;
  // The plan of the kernel of each formula, made at its first read.
  readonly #plans = new Map<Expr, KernelPlan>();
  // Stryker disable next-line ArrayDeclaration: the search never reads below the root of a component
  readonly #stack: { readonly table: Table; readonly column: string; readonly key: string; readonly visit: Visit }[] = [];
  // Stryker disable next-line all: the placeholder at the top is not a cell, so the search reads none of its fields
  #top: Visit = { index: -1, low: -1, reread: false, result: cycleError("", "") };
  #next = 0;

  constructor(columns: ReadonlyMap<string, Expr>, opts: SheetOptions) {
    const { cells, name, tables, space, vars, ...rest } = opts;
    this.#main = tableOf("the sheet", space, columns, cells);
    // The first table of a name wins, and the main table comes first.
    this.#bySpace.set(space, this.#main);
    if (name !== undefined) this.#byName.set(name, this.#main);
    if (tables !== undefined) {
      for (const [n, t] of tables) {
        if (this.#byName.has(n)) continue;
        const table = tableOf(`the table "${n}"`, t.space, t.columns, t.cells);
        this.#byName.set(n, table);
        if (!this.#bySpace.has(t.space)) this.#bySpace.set(t.space, table);
      }
    }
    const handler: ExtHandler = (data, ctx) => {
      // The interpreter gives an error without an origin the path and the position of its node.
      if (!isCellRef(data)) return fail(vexError("bad-expression", "a cell reference needs a column name and an address of fixed moves"));
      const where = resolveAddr(ctx.space, ctx.position, data.at);
      // Each space of an evaluation is the space of a table, so the main table is a default that no read takes.
      const table = this.#bySpace.get(ctx.space) ?? this.#main;
      return where.ok ? this.#read(table, data.column, where.value) : fail({ ...where.error, path: ctx.path });
    };
    this.#compile = { ...rest, extensions: { ...rest.extensions, "vex.cell": handler } };
    this.#tables = Object.fromEntries([...this.#byName].map(([n, t]) => [n, t.space]));
    this.#vars = vars;
  }

  /** This method gives the result of the column `column` at the key `key` of the main table, or of the table `table`. */
  cell(column: string, key: string, table?: string): Result<unknown> {
    if (table === undefined) return this.#read(this.#main, column, key);
    const t = this.#byName.get(table);
    if (t === undefined) return fail(vexError("no-table", `the run has no table "${table}"`, { origin: key, focus: key }));
    return this.#read(t, column, key);
  }

  #read(t: Table, column: string, key: string): Result<unknown> {
    const done = entryOf(t.done, column, key);
    if (done !== undefined) return done;
    const caller = this.#top;
    const seen = entryOf(t.visits, column, key);
    if (seen !== undefined) {
      caller.low = Math.min(caller.low, seen.index);
      seen.reread = true;
      return cycleError(column, key);
    }
    // A cell with its own formula takes that formula, and the other cells take the formula of the column.
    const program = t.cells.get(column)?.get(key) ?? t.columns.get(column);
    if (program === undefined) {
      const message = t.cells.has(column) ? `the cell "${column}" at "${key}" has no formula` : `${t.where} has no column "${column}"`;
      return fail(vexError("unbound", message, { origin: key, focus: key }));
    }
    const n = this.#next++;
    const visit: Visit = { index: n, low: n, reread: false, result: cycleError(column, key) };
    setEntry(t.visits, column, key, visit);
    this.#stack.push({ table: t, column, key, visit });
    this.#top = visit;
    let plan = this.#plans.get(program);
    if (plan === undefined) {
      plan = kernelPlan(program, this.#compile);
      this.#plans.set(program, plan);
    }
    visit.result = plan.run({ space: t.space, origin: key, tables: this.#tables, ...(this.#vars === undefined ? {} : { vars: this.#vars }) });
    this.#top = caller;
    if (visit.low === visit.index) {
      const members = this.#stack.splice(this.#stack.findIndex((m) => m.visit === visit));
      // A component of two or more cells reads its root again, so visit.reread alone decides. The length test is a guard.
      // Stryker disable next-line ConditionalExpression,LogicalOperator: members.length > 1 implies visit.reread
      const cyclic = members.length > 1 || visit.reread;
      for (const m of members) {
        // Stryker disable next-line CallExpression,OptionalChaining: a finished cell has a result, and a read looks for the result first
        m.table.visits.get(m.column)?.delete(m.key);
        setEntry(m.table.done, m.column, m.key, cyclic ? cycleError(m.column, m.key) : m.visit.result);
      }
    } else {
      caller.low = Math.min(caller.low, visit.low);
    }
    return entryOf(t.done, column, key) ?? cycleError(column, key);
  }
}
