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
import { evaluate, explain, nestingOf, type CompileOptions, type EvalOptions, type ExtHandler, type Program } from "./evaluate.ts";
import { children, ext, isMove, type Addr, type Axis, type Expr, type Move } from "./ir.ts";
import { fail, type Result } from "./result.ts";
import { resolveAddr, type Space } from "./space.ts";
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

/** A table of a run: its space, the formulas of its columns, and the formulas of its cells. */
export interface SheetTable {
  readonly space: Space;
  readonly columns: ReadonlyMap<string, Expr>;
  readonly cells?: CellFormulas;
}

/** The options of a sheet run: the evaluation options without the origin and the trace, and the tables. */
export type SheetOptions = Omit<EvalOptions, "origin" | "trace" | "tables"> & {
  /** The cells with their own formula. The formula of a cell replaces the formula of its column at its key. */
  readonly cells?: CellFormulas;
  /** The name of this table, so the axis `table(name)` in a formula of another table can read it. */
  readonly name?: string;
  /** The other tables, by name (SHEET.TABLES). A cell reference reads the table of the space where it evaluates. */
  readonly tables?: ReadonlyMap<string, SheetTable>;
  /**
   * The compiler of the formulas of the columns (SHEET.COMPILE), for example `tiered` of `@mark1russell7/vex-compiler`.
   * Without a compiler, the interpreter evaluates each formula. The compiled program must give the results of the
   * interpreter.
   */
  readonly compile?: CompileFn;
};

/** A compiler of the formulas of the columns of a run. */
export type CompileFn = (expr: Expr, options: CompileOptions) => Program;

/**
 * The compiled programs of the formulas of the columns: one entry for each formula, for the last compiler and options.
 * A compiled program reads the cells of the active run, so each run with the same compiler and options can use it.
 */
const PROGRAMS = new WeakMap<Expr, { readonly compile: CompileFn; readonly domains: unknown; readonly fns: unknown; readonly extensions: unknown; readonly program: Program }>();

/** The key of the options without extensions, for the extensions of the compiled programs. */
const NO_EXTENSIONS = {};

/** The state of one table in a run. */
interface Table {
  /** The words for the table in a message: "the sheet" for the main table, or the table and its name. */
  readonly where: string;
  /** A short text for the ids of the cells of the table. */
  readonly tag: string;
  readonly space: Space;
  readonly columns: ReadonlyMap<string, Expr>;
  readonly cells: CellFormulas;
  // For each column, the number of keys at the start of the key order that a warm-up evaluated.
  readonly warmed: Map<string, number>;
  // The position of each key in the key order, made at the first warm-up.
  index: ReadonlyMap<string, number> | undefined;
  /** The result of each finished cell: for each column, the result at each key. */
  readonly done: Map<string, Map<string, Result<unknown>>>;
}

const cycleError = (column: string, key: string): Result<never> =>
  fail(vexError("cycle", `the cell "${column}" at "${key}" is on a cycle of cell references`, { origin: key, focus: key }));

/** The id of a cell. */
const idOf = (t: Table, column: string, key: string): string => `${t.tag}\u0001${column}\u0000${key}`;

/** This function gives the state of a table at the start of a run. */
const tableState = (where: string, i: number, t: SheetTable): Table => ({ where, tag: String(i), space: t.space, columns: t.columns, cells: t.cells ?? new Map(), warmed: new Map(), index: undefined, done: new Map() });

/** This function gives the result of a finished cell, or `undefined`. */
const doneOf = (t: Table, column: string, key: string): Result<unknown> | undefined => t.done.get(column)?.get(key);

/** This function keeps the result of a finished cell. */
function setDone(t: Table, column: string, key: string, result: Result<unknown>): void {
  let results = t.done.get(column);
  if (results === undefined) {
    results = new Map();
    t.done.set(column, results);
  }
  results.set(key, result);
}

/** The directions of the reads of a column from itself: to an earlier key, to a later key, up a tree, or down a tree. */
interface Directions {
  before: boolean;
  after: boolean;
  up: boolean;
  down: boolean;
}

/** This function adds the direction of one move or one axis of a read of a column from itself. */
function addDirection(d: Directions, m: Move | Axis): void {
  if (m.t === "offset") {
    const step = m.d.find((x) => x !== 0) ?? 0;
    if (step < 0) d.before = true;
    if (step > 0) d.after = true;
  } else if (m.t === "window") {
    if (m.from < 0) d.before = true;
    if (m.to > 0) d.after = true;
  } else if (m.t === "parent" || m.t === "ancestors") d.up = true;
  else if (m.t === "children" || m.t === "descendants") d.down = true;
}

/**
 * This function gives the columns that the formulas of the column `self` read with a cell reference: its formula and
 * the formulas of its cells. It also gives the directions of their reads of the column itself. It walks each
 * expression with a stack, not with recursion.
 */
function readsOf(t: Table, self: string): { readonly columns: ReadonlySet<string>; readonly directions: Directions } {
  const columns = new Set<string>();
  const directions: Directions = { before: false, after: false, up: false, down: false };
  const formula = t.columns.get(self);
  const todo: [Expr, readonly Axis[]][] = [...(formula === undefined ? [] : [formula]), ...(t.cells.get(self)?.values() ?? [])].map((e) => [e, []]);
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const [e, axes] = item;
    if (e.tag === "ext") {
      if (e.kind === CELL_KIND && isCellRef(e.data)) {
        columns.add(e.data.column);
        if (e.data.column === self) for (const m of [...axes, ...e.data.at]) addDirection(directions, m);
      }
    } else if (e.tag === "each") {
      const inner: Axis[] = [...axes];
      for (let a: Axis = e.axis; ; a = a.axis) {
        if (a.t !== "where") {
          inner.push(a);
          break;
        }
        todo.push([a.test, [...axes, a]]);
      }
      todo.push([e.body, inner]);
    } else for (const child of children(e)) todo.push([child, axes]);
  }
  return { columns, directions };
}

/**
 * This function gives the columns of a table in an order where each column comes after the columns that it reads.
 * The columns of a cycle keep their order. The columns with formulas of cells only come last.
 */
function columnOrder(t: Table): readonly string[] {
  const names = new Set([...t.columns.keys(), ...t.cells.keys()]);
  let left = [...names].map((c) => ({ c, needs: [...readsOf(t, c).columns].filter((x) => x !== c && names.has(x)) }));
  const order: string[] = [];
  const placed = new Set<string>();
  // Each pass places each column whose reads are placed. A pass that places no column leaves a cycle, so it places
  // the first column that is left.
  while (left.length > 0) {
    const ready = left.filter((x) => x.needs.every((n) => placed.has(n)));
    for (const x of ready.length > 0 ? ready : left.slice(0, 1)) {
      order.push(x.c);
      placed.add(x.c);
    }
    left = left.filter((x) => !placed.has(x.c));
  }
  return order;
}

/**
 * This function gives the keys of a space in the order of the reads of a column from itself. In a tree, the children
 * come before their parent when the column reads down the tree. A read of a later key reverses the order.
 */
function keyOrder(s: Space, d: Directions): readonly string[] {
  const reverse = d.after && !d.before;
  if (s.parentOf === undefined || s.childrenOf === undefined) return reverse ? s.keys.toReversed() : s.keys;
  const parentOf = s.parentOf.bind(s);
  const childrenOf = s.childrenOf.bind(s);
  const post = d.down && !d.up;
  const kids = (k: string | undefined): readonly string[] => {
    const ks = k === undefined ? s.keys.filter((x) => parentOf(x) === undefined) : childrenOf(k);
    return reverse ? ks.toReversed() : ks;
  };
  const out: string[] = [];
  // Each entry is a key, and true when its children are on the stack already.
  const stack: [string, boolean][] = kids(undefined).map((k): [string, boolean] => [k, false]).toReversed();
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const [k, expanded] = item;
    if (expanded || !post) out.push(k);
    if (expanded) continue;
    if (post) stack.push([k, true]);
    for (const c of kids(k).toReversed()) stack.push([c, false]);
  }
  return out;
}

/** The state of one cell in the search. */
interface Visit {
  readonly id: string;
  readonly table: Table;
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
 *
 * A run can have more tables (SHEET.TABLES). Each table has its own space, and one search covers the cells of all
 * the tables. Thus a cycle across tables gives `#CYCLE!` too.
 */
export class SheetRun {
  readonly #main: Table;
  // The tables by name and by space. A cell reference reads the table of the space where it evaluates.
  readonly #byName = new Map<string, Table>();
  readonly #bySpace = new Map<Space, Table>();
  readonly #opts: Omit<EvalOptions, "origin" | "trace" | "space">;
  // The cells on the stack of the search: started, but their component is not finished.
  readonly #visits = new Map<string, Visit>();
  // Stryker disable next-line ArrayDeclaration: the search never reads below the root of a component
  readonly #stack: Visit[] = [];
  // The cell whose formula is in evaluation. At the top level, it is a placeholder that is not a cell.
  #top: Visit;
  // The placeholder at the top in a fill, and true when the evaluation of a fill reads a cell that is not finished.
  readonly #filling: Visit;
  #missed = false;
  #next = 0;
  // The estimated frames of the stack that the evaluations in progress use, and the cost of each program.
  #used = 0;
  readonly #cost = new Map<Expr, number>();
  readonly #budget: number;
  readonly #compile: CompileFn | undefined;
  readonly #compileOptions: CompileOptions;
  // The run that evaluates a formula with a compiled program. Each run is synchronous, so a run inside the evaluation
  // of another run gives the active run back when it ends.
  static #active: SheetRun | undefined;
  // The extensions of the compiled programs, for each object of extensions of the options. Their cell handler reads
  // the cells of the active run, so a compiled program does not depend on one run.
  static readonly #shared = new WeakMap<object, Readonly<Record<string, ExtHandler>>>();

  /** `budget` is the budget of the stack in estimated frames. A test can make it small, so the run pauses often. */
  constructor(columns: ReadonlyMap<string, Expr>, opts: SheetOptions, budget: number = STACK_BUDGET) {
    const { cells, name, tables, space, compile, ...rest } = opts;
    this.#main = { where: "the sheet", tag: "0", space, columns, cells: cells ?? new Map(), warmed: new Map(), index: undefined, done: new Map() };
    this.#bySpace.set(space, this.#main);
    if (name !== undefined) this.#byName.set(name, this.#main);
    if (tables !== undefined) {
      let i = 0;
      for (const [n, t] of tables) {
        if (this.#byName.has(n)) continue;
        const other = tableState(`the table "${n}"`, ++i, t);
        this.#byName.set(n, other);
        // A table with the space of an earlier table does not take its cells: the first table keeps the space.
        if (!this.#bySpace.has(t.space)) this.#bySpace.set(t.space, other);
      }
    }
    // Stryker disable next-line all: the placeholder is not a cell, so the search reads none of its fields
    this.#top = { id: "", table: this.#main, column: "", key: "", index: -1, low: -1, reread: false, result: cycleError("", ""), paused: false, need: undefined };
    // Stryker disable next-line all: the placeholder is not a cell, so the search reads none of its fields
    this.#filling = { id: "", table: this.#main, column: "", key: "", index: 0, low: 0, reread: false, result: cycleError("", ""), paused: false, need: undefined };
    this.#budget = budget;
    this.#compile = compile;
    const spaces = Object.fromEntries([...this.#byName].map(([n, t]) => [n, t.space]));
    this.#opts = { ...rest, tables: spaces, extensions: { ...rest.extensions, [CELL_KIND]: this.#handler } };
    const outer = rest.extensions ?? NO_EXTENSIONS;
    let shared = SheetRun.#shared.get(outer);
    if (shared === undefined) {
      shared = { ...rest.extensions, [CELL_KIND]: SheetRun.#cellOfActive };
      SheetRun.#shared.set(outer, shared);
    }
    this.#compileOptions = { ...this.#opts, extensions: shared };
  }

  /** The cell handler of the compiled programs: it reads the cells of the active run. */
  static readonly #cellOfActive: ExtHandler = (data, ctx) => {
    const run = SheetRun.#active;
    return run === undefined ? fail(vexError("unbound", "a compiled formula reads cells only in the evaluation of a sheet run", { path: ctx.path })) : run.#handler(data, ctx);
  };

  /** This method gives the program of a cell: its own formula, or the formula of its column (SHEET.CELL.FORMULA). */
  #programOf(t: Table, column: string, key: string): Expr | undefined {
    // Stryker disable next-line ConditionalExpression: without formulas of cells, the lookup gives undefined anyway
    const own = t.cells.size === 0 ? undefined : t.cells.get(column)?.get(key);
    return own ?? t.columns.get(column);
  }

  /** This method gives the error of a cell without a program. */
  #unbound(t: Table, column: string, key: string): Result<never> {
    const message = t.cells.has(column) ? `the cell "${column}" at "${key}" has no formula` : `${t.where} has no column "${column}"`;
    return fail(vexError("unbound", message, { origin: key, focus: key }));
  }

  /** This method gives the table of a name for a read from a host. Without a name, it is the main table. */
  #named(table: string | undefined, key: string): Table | Result<never> {
    if (table === undefined) return this.#main;
    return this.#byName.get(table) ?? fail(vexError("no-table", `the run has no table "${table}"`, { origin: key, focus: key }));
  }

  readonly #handler: ExtHandler = (data, ctx) => {
    if (!isCellRef(data)) return fail(vexError("bad-expression", "a cell reference needs a column name and an address", { path: ctx.path }));
    const where = resolveAddr(ctx.space, ctx.position, data.at);
    if (!where.ok) return fail({ ...where.error, path: ctx.path });
    // The evaluation of a cell has the space of its table, and the body of the axis table has the space of that table.
    /* v8 ignore next -- @preserve: each space of an evaluation of the run is the space of a table */
    return this.#read(this.#bySpace.get(ctx.space) ?? this.#main, data.column, where.value);
  };

  /**
   * This method gives the result of one cell: the column `column` at the key `key` of the main table, or of the table
   * `table`. A read from a host first evaluates the column at the keys before `key`, in key order. Thus a recurrence
   * over the keys reads finished cells.
   */
  cell(column: string, key: string, table?: string): Result<unknown> {
    const t = this.#named(table, key);
    if (!("space" in t)) return t;
    // The placeholder at the top has the index -1. A read inside a formula has a cell at the top, so it does not warm.
    if (this.#top.index >= 0) return this.#read(t, column, key);
    // A finished cell needs no warm-up.
    const done = doneOf(t, column, key);
    if (done !== undefined) return done;
    this.#warmTo(t, column, key);
    return this.#drive(t, column, key);
  }

  /** This method evaluates the column `column` at each key before `key` that it did not evaluate before, in key order. */
  #warmTo(t: Table, column: string, key: string): void {
    if (!t.columns.has(column)) return;
    const keys = t.space.keys;
    t.index ??= new Map(keys.map((k, i) => [k, i]));
    const end = t.index.get(key) ?? 0;
    const start = t.warmed.get(column) ?? 0;
    for (let i = start; i < end; i++) this.#drive(t, column, keys[i] ?? key);
    if (end > start) t.warmed.set(column, end);
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
  #start(t: Table, column: string, key: string): Visit {
    const n = this.#next++;
    const visit: Visit = { id: idOf(t, column, key), table: t, column, key, index: n, low: n, reread: false, result: cycleError(column, key), paused: false, need: undefined };
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
    const result = this.#run(visit.table, visit.column, visit.key, program);
    this.#used -= cost;
    this.#top = caller;
    if (!visit.paused) visit.result = result;
  }

  /** This method evaluates the formula `program` of a cell, with its compiled program or with the interpreter. */
  #run(t: Table, column: string, key: string, program: Expr): Result<unknown> {
    const options = { ...this.#opts, space: t.space, origin: key };
    const compiled = this.#compiled(t, column, program);
    if (compiled === undefined) return evaluate(program, options);
    const active = SheetRun.#active;
    SheetRun.#active = this;
    const result = compiled.run(options);
    SheetRun.#active = active;
    return result;
  }

  /**
   * This method gives the compiled program of the formula of a column, or `undefined` for the interpreter. A formula
   * compiles once for each compiler and options, also across runs.
   */
  #compiled(t: Table, column: string, program: Expr): Program | undefined {
    const compile = this.#compile;
    // The formula of a cell evaluates once in a run, so the run compiles only the formulas of the columns.
    if (compile === undefined || t.columns.get(column) !== program) return undefined;
    const { domains, fns, extensions } = this.#compileOptions;
    const hit = PROGRAMS.get(program);
    if (hit !== undefined && hit.compile === compile && hit.domains === domains && hit.fns === fns && hit.extensions === extensions) return hit.program;
    const compiled = compile(program, this.#compileOptions);
    PROGRAMS.set(program, { compile, domains, fns, extensions, program: compiled });
    return compiled;
  }

  /** This method ends a cell whose evaluation did not pause: it finishes its component, or it gives its low to the caller. */
  #end(visit: Visit, caller: Visit | undefined): void {
    if (visit.low === visit.index) this.#finish(visit);
    else if (caller !== undefined) caller.low = Math.min(caller.low, visit.low);
  }

  /** This method reads a cell from the formula of the cell at the top. */
  #read(t: Table, column: string, key: string): Result<unknown> {
    const done = doneOf(t, column, key);
    if (done !== undefined) return done;
    const caller = this.#top;
    // A paused evaluation reads no other cell, so it does not follow a path that its final evaluation does not follow.
    // In a fill, the cell goes to the search after the evaluation (SHEET.FILL).
    if (caller.paused) return cycleError(column, key);
    if (caller === this.#filling) {
      this.#missed = true;
      return cycleError(column, key);
    }
    const id = idOf(t, column, key);
    const seen = this.#visits.get(id);
    if (seen !== undefined) {
      // A read of a cell that is not finished: the caller and this cell are on one cycle. The cell is on the
      // stack of the search, so it is in the component of the caller. Thus a component with one cell is cyclic
      // only if that cell reads itself.
      caller.low = Math.min(caller.low, seen.index);
      seen.reread = true;
      return cycleError(column, key);
    }
    const program = this.#programOf(t, column, key);
    if (program === undefined) return this.#unbound(t, column, key);
    const visit = this.#start(t, column, key);
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
    return doneOf(t, column, key) ?? cycleError(column, key);
  }

  /** This method evaluates a cell from the top level. The cells that pause go on a list, not on the call stack. */
  #drive(t: Table, column: string, key: string): Result<unknown> {
    const done = doneOf(t, column, key);
    if (done !== undefined) return done;
    if (this.#programOf(t, column, key) === undefined) return this.#unbound(t, column, key);
    const work: Visit[] = [this.#start(t, column, key)];
    for (let visit = work.at(-1); visit !== undefined; visit = work.at(-1)) {
      const program = this.#programOf(visit.table, visit.column, visit.key);
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
    return doneOf(t, column, key) ?? cycleError(column, key);
  }

  /** This method takes the component of `root` from the stack, and sets the final result of each of its cells. */
  #finish(root: Visit): void {
    // The root is near the top of the stack, so the search starts at the top: a deep chain needs no long scan.
    const members = this.#stack.splice(this.#stack.lastIndexOf(root));
    // A component of two or more cells reads its root again, so root.reread alone decides. The length test is a guard.
    // Stryker disable next-line ConditionalExpression,LogicalOperator: members.length > 1 implies root.reread
    const cyclic = members.length > 1 || root.reread;
    for (const m of members) {
      // Stryker disable next-line CallExpression: a finished cell has a result, and a read looks for the result first
      this.#visits.delete(m.id);
      setDone(m.table, m.column, m.key, cyclic ? cycleError(m.column, m.key) : m.result);
    }
  }

  /** This method evaluates one cell with a trace of the nodes of its program. The result is the result of the cell. */
  explain(column: string, key: string, table?: string): Trace {
    const result = this.cell(column, key, table);
    const t = this.#named(table, key);
    const program = "space" in t ? this.#programOf(t, column, key) : undefined;
    if (program === undefined || !("space" in t)) return { events: [], result };
    return { events: explain(program, { ...this.#opts, space: t.space, origin: key }).events, result };
  }

  /**
   * This method evaluates each cell of the table `table`, or of the main table (SHEET.FILL). Each column comes after
   * the columns that it reads, and the keys of a column come in the order of its reads from itself. Thus most reads
   * find a finished cell. An evaluation that reads a cell that is not finished has no effect, and the search then
   * evaluates its cell. A read of a cell gives the same result after a fill.
   */
  fill(table?: string): void {
    const t = this.#named(table, "");
    // A read inside a formula has a cell at the top. A fill there has no effect.
    if (!("space" in t) || this.#top.index >= 0) return;
    const host = this.#top;
    for (const column of columnOrder(t)) {
      const formula = t.columns.get(column);
      const own = t.cells.get(column);
      const keys = formula === undefined ? t.space.keys.filter((k) => own?.has(k) === true) : keyOrder(t.space, readsOf(t, column).directions);
      for (const key of keys) {
        const program = this.#programOf(t, column, key);
        if (program === undefined || doneOf(t, column, key) !== undefined) continue;
        this.#top = this.#filling;
        this.#missed = false;
        const result = this.#run(t, column, key, program);
        this.#top = host;
        if (this.#missed) this.#drive(t, column, key);
        else setDone(t, column, key, result);
      }
    }
  }

  /**
   * This method evaluates the column `column` at each key before `key`, in key order. A recurrence over the keys,
   * for example a running total, then reads finished cells.
   */
  warm(column: string, key: string, table?: string): void {
    const t = this.#named(table, key);
    // Stryker disable next-line all: a warm-up changes no result, only the depth of the recursion (SHEET.ORDER)
    if ("space" in t) this.#warmTo(t, column, key);
  }
}
