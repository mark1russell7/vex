/**
 * The compiler of the formula language. It changes the syntax tree of a formula into an expression of the Vex IR.
 * A value column is a field of the row records, so a read of it is a `ref`. A formula column is a column of a
 * sheet, so a read of it is a cell reference. Thus a cycle of formula columns gives `#CYCLE!`.
 */
import { app, axes, cell, each, key, let_, lit, offset, origin, parent, ref, v, type Axis, type Expr, type Move } from "@mark1russell7/vex";
import { Vec2 } from "@mark1russell7/vex-domains";
import { BUILT_IN_NAMES, OP_NAMES } from "./functions.ts";
import { ADDRESS, AGGREGATES, axisText, FormulaSyntaxError, parseFormula, type AggAxis, type AggregateName, type Ast, type AxisName, type BinaryOp, type Nav, type Span } from "./syntax.ts";

/** The columns that a formula can read. */
export interface FormulaContext {
  /** The fields of the row records. A read of a value column is a `ref`. */
  readonly valueColumns: readonly string[];
  /** The other formula columns. A read of a formula column is a cell reference. */
  readonly formulaColumns: readonly string[];
  /** The keys of the rows with each name, for `row("name")`. Without this map, the name is the key of the row. */
  readonly rowNames?: ReadonlyMap<string, readonly string[]>;
  /** The cells of a grid, for the addresses like `B2` and the ranges like `B2:D4`. A table has no grid. */
  readonly grid?: GridContext;
  /** The other tables of the document, by name, for `table("name")`. */
  readonly tables?: ReadonlyMap<string, TableContext>;
}

/** The columns and the rows of another table of the document. */
export interface TableContext {
  readonly valueColumns: readonly string[];
  readonly formulaColumns: readonly string[];
  /** The keys of the rows with each name. */
  readonly rowNames?: ReadonlyMap<string, readonly string[]>;
  /** The value column with the names of the rows, for `table("name").row("row")`. */
  readonly nameColumn?: string;
}

/** The kind of a cell of a grid that is not empty: a value of a kind, or a formula. */
export type GridCellKind = "number" | "boolean" | "text" | "date" | "formula";

/** The cells of a grid: the columns by their letters, the rows by their numbers, and each cell that is not empty. */
export interface GridContext {
  /** The letters of the columns, in order: "A" first. The name of a column of a grid is its letter. */
  readonly columns: readonly string[];
  /** The key of each row, in order: the key of row 1 first. */
  readonly rows: readonly string[];
  /** The kind of each cell that is not empty, by its address in capital letters, for example "B2". */
  readonly cells: ReadonlyMap<string, GridCellKind>;
}

/** The largest number of cells in one range, so a range like A1:ZZZ99999 cannot block the page. */
export const MAX_RANGE = 10_000;

/** An error of a formula: a message, and the span of the text that has the problem. */
export interface FormulaError {
  readonly message: string;
  readonly span: Span;
}

/** The result of the compiler: an expression and the names of the columns that it reads, or an error. */
export type CompileResult = { readonly ok: true; readonly expr: Expr; readonly reads: readonly string[] } | { readonly ok: false; readonly error: FormulaError };

const BINARY: Readonly<Record<Exclude<BinaryOp, "<>">, string>> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide", "^": "pow", "&": "concat", "=": "eq", "<": "lt", "<=": "lte", ">": "gt", ">=": "gte" };
const AXIS: Readonly<Record<AxisName, Axis>> = { children: axes.children, descendants: axes.descendants, ancestors: axes.ancestors, siblings: axes.siblings, others: axes.others, all: axes.all };

// The arithmetic of the finance functions, as expressions of the IR.
const add = (p: Expr, q: Expr): Expr => app("add", p, q);
const sub = (p: Expr, q: Expr): Expr => app("subtract", p, q);
const mul = (p: Expr, q: Expr): Expr => app("multiply", p, q);
const div = (p: Expr, q: Expr): Expr => app("divide", p, q);
const neg = (p: Expr): Expr => app("negate", p);

/**
 * The finance functions of a spreadsheet, with its signs: money that you pay is negative. Each function binds its
 * arguments once with a let, and its body is arithmetic, so the steps of a cell show the calculation. The type 1
 * puts each payment at the start of its period. A rate of 0 has its own formula, because the general formula
 * divides by 0 there.
 */
function finance(name: "PMT" | "FV" | "PV" | "NPER", given: readonly Expr[]): Expr {
  const [r, a, b, c = lit(0), t = lit(0)] = given;
  const rate = v("$rate");
  const x = v("$x");
  const y = v("$y");
  const z = v("$z");
  // The growth of one unit over n periods, and the factor of the time of a payment.
  const growth = (n: Expr): Expr => app("pow", add(lit(1), rate), n);
  const timing = add(lit(1), mul(rate, v("$type")));
  let general: Expr;
  let zero: Expr;
  switch (name) {
    case "PMT": // x = nper, y = pv, z = fv
      general = neg(div(mul(rate, add(mul(y, growth(x)), z)), mul(timing, sub(growth(x), lit(1)))));
      zero = neg(div(add(y, z), x));
      break;
    case "FV": // x = nper, y = pmt, z = pv
      general = neg(add(mul(z, growth(x)), div(mul(mul(y, timing), sub(growth(x), lit(1))), rate)));
      zero = neg(add(z, mul(y, x)));
      break;
    case "PV": // x = nper, y = pmt, z = fv
      general = neg(div(add(z, div(mul(mul(y, timing), sub(growth(x), lit(1))), rate)), growth(x)));
      zero = neg(add(z, mul(y, x)));
      break;
    case "NPER": // x = pmt, y = pv, z = fv
      general = div(app("ln", div(sub(mul(x, timing), mul(z, rate)), add(mul(x, timing), mul(y, rate)))), app("ln", add(lit(1), rate)));
      zero = neg(div(add(y, z), x));
      break;
  }
  const bind = { $rate: r ?? lit(0), $x: a ?? lit(0), $y: b ?? lit(0), $z: c, $type: t };
  return let_(bind, app("if", app("eq", rate, lit(0)), zero, general));
}

/** This function gives the Vex axis of the axis of an aggregate. `rows(from, to)` is the axis `window(from, to)`. */
const axisOf = (a: Exclude<AggAxis, { readonly range: unknown } | { readonly table: unknown }>): Axis => (typeof a === "string" ? AXIS[a] : axes.window(a.from, a.to));

/** This function reads a cell address, for example "B12", as a column letter and a row number. */
function parseAddress(text: string): { readonly letter: string; readonly row: number } {
  const m = ADDRESS.exec(text.toUpperCase());
  return { letter: m?.[1] ?? "", row: Number(m?.[2] ?? 0) };
}

/** This function joins the values with the op `op` in a balanced tree, so 1000 values make a tree 10 levels deep. */
function balanced(op: string, values: readonly Expr[]): Expr {
  if (values.length === 1) return values[0] ?? lit(0);
  const mid = Math.floor(values.length / 2);
  return app(op, balanced(op, values.slice(0, mid)), balanced(op, values.slice(mid)));
}
const STRICT = lit({ strict: true });

/** Where a part of a formula evaluates. `base` comes before each address. `inAggregate` is true in an aggregate. */
interface Scope {
  readonly base: readonly Move[];
  readonly inAggregate: boolean;
  /**
   * Inside the axis of another table: the name and the columns of that table. A read of the row of the formula
   * (`this.name`) goes into `hoist`. The outermost axis of a table binds it in a let before the axis.
   */
  readonly table?: { readonly name: string; readonly cols: TableContext; readonly hoist: Map<string, { readonly name: string; readonly expr: Expr }> };
}

/** This function gives the column of the name `name` in the columns `cols`: the same name, or the same name in small letters. */
function findColumn(cols: TableContext, name: string): { readonly name: string; readonly formula: boolean } | undefined {
  const lower = name.toLowerCase();
  const found =
    cols.valueColumns.find((c) => c === name) ??
    cols.formulaColumns.find((c) => c === name) ??
    cols.valueColumns.find((c) => c.toLowerCase() === lower) ??
    cols.formulaColumns.find((c) => c.toLowerCase() === lower);
  return found === undefined ? undefined : { name: found, formula: !cols.valueColumns.includes(found) };
}

/** This function gives the column `name` of the other table `table`. A name of no column is an error with its span. */
function columnOf(table: string, cols: TableContext, name: string, span: Span): { readonly name: string; readonly formula: boolean } {
  const found = findColumn(cols, name);
  if (found === undefined) throw new FormulaSyntaxError(`the table "${table}" has no column "${name}"`, span);
  return found;
}

/** This function compiles a syntax tree. A problem gives a result with an error. */
export function compileAst(ast: Ast, ctx: FormulaContext): CompileResult {
  const reads: string[] = [];
  const column = (name: string, span: Span): { readonly name: string; readonly formula: boolean } => {
    if (name.includes(".")) throw new FormulaSyntaxError(`a column name has no dot: "${name}"`, span);
    const found = findColumn(ctx, name);
    if (found === undefined) throw new FormulaSyntaxError(`the column "${name}" does not exist`, span);
    if (!reads.includes(found.name)) reads.push(found.name);
    return found;
  };

  // The context of another table. A name of no table is an error with its span.
  const tableOf = (name: string, span: Span): TableContext => {
    const t = ctx.tables?.get(name);
    if (t === undefined) throw new FormulaSyntaxError(`the table "${name}" does not exist`, span);
    return t;
  };

  // The name of a row must find exactly one row, so a formula does not read a row that the author did not mean.
  const rowKey = (name: string, span: Span): string => {
    if (ctx.rowNames === undefined) return name;
    const keys = ctx.rowNames.get(name) ?? [];
    if (keys.length === 0) throw new FormulaSyntaxError(`no row has the name "${name}"`, span);
    const [only] = keys;
    if (keys.length > 1 || only === undefined) throw new FormulaSyntaxError(`${keys.length} rows have the name "${name}". Give the row a name that no other row has`, span);
    return only;
  };
  const navMove = (n: Nav): Move => {
    switch (n.t) {
      case "this":
        return origin;
      case "parent":
        return parent;
      case "row":
        return offset(n.n);
      case "key":
        return key(rowKey(n.name, n.span));
      case "table":
        throw new FormulaSyntaxError(`table("${n.name}"). comes first, for example table("${n.name}").row("name").column`, n.span);
    }
  };

  // A row of another table by its name: the first row whose name is the name. The compiler checks that exactly one
  // row has the name, so the formula does not read a row that the author did not mean.
  const lookup = (a: Extract<Ast, { k: "name" }>, first: Extract<Nav, { t: "table" }>): Expr => {
    const [, second, ...more] = a.nav;
    if (second?.t !== "key" || more.length > 0) throw new FormulaSyntaxError(`after table("${first.name}"), write row("name") and a column, for example table("${first.name}").row("name").column`, first.span);
    const t = tableOf(first.name, first.span);
    if (t.nameColumn === undefined) throw new FormulaSyntaxError(`the rows of the table "${first.name}" have no names, because its first column is not a text column`, first.span);
    const keys = t.rowNames?.get(second.name) ?? [];
    if (keys.length === 0) throw new FormulaSyntaxError(`no row of the table "${first.name}" has the name "${second.name}"`, second.span);
    if (keys.length > 1) throw new FormulaSyntaxError(`${keys.length} rows of the table "${first.name}" have the name "${second.name}". Give the row a name that no other row has`, second.span);
    const c = columnOf(first.name, t, a.name, a.span);
    const test = app("ifError", app("eq", app("trim", ref([t.nameColumn])), lit(second.name)), lit(false));
    return app("first", each(axes.where(axes.table(first.name), test), c.formula ? cell(c.name) : ref([c.name])), STRICT);
  };

  // An address of a grid reads the cell at that column and row. An empty cell reads as 0, as in a spreadsheet.
  const address = (grid: GridContext, text: string, span: Span): Expr => {
    const { letter, row } = parseAddress(text);
    const at = grid.rows[row - 1];
    if (!grid.columns.includes(letter) || at === undefined) throw new FormulaSyntaxError(`the grid has no cell ${letter}${row}`, span);
    if (!grid.cells.has(`${letter}${row}`)) return lit(0);
    if (!reads.includes(letter)) reads.push(letter);
    return cell(letter, [key(at)]);
  };

  // A range of a grid gives the cells between its two corners. The aggregates of numbers take the cells with a number
  // or a formula, and ANY and ALL take the cells with a boolean or a formula. Thus an empty cell and a label in the
  // range do not count, as in a spreadsheet. The expression is a balanced tree of ops, so its depth stays small.
  const range = (fn: AggregateName, fromText: string, toText: string, span: Span): Expr => {
    const grid = ctx.grid;
    if (grid === undefined) throw new FormulaSyntaxError("a range like A1:B3 needs a grid sheet. In a table, an aggregate takes an axis", span);
    const [p, q] = [parseAddress(fromText), parseAddress(toText)];
    const [pc, qc] = [grid.columns.indexOf(p.letter), grid.columns.indexOf(q.letter)];
    const [c0, c1, r0, r1] = [Math.min(pc, qc), Math.max(pc, qc), Math.min(p.row, q.row), Math.max(p.row, q.row)];
    for (const corner of [fromText, toText]) address(grid, corner, span);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_RANGE) throw new FormulaSyntaxError(`the range has more than ${MAX_RANGE} cells`, span);
    const logic = fn === "ANY" || fn === "ALL";
    const values: Expr[] = [];
    for (const letter of grid.columns.slice(c0, c1 + 1)) {
      for (let row = r0; row <= r1; row++) {
        const kind = grid.cells.get(`${letter}${row}`);
        if (kind === "formula" || kind === (logic ? "boolean" : "number")) values.push(address(grid, `${letter}${row}`, span));
      }
    }
    const n = values.length;
    switch (fn) {
      case "SUM":
        return n === 0 ? lit(0) : balanced("add", values);
      case "COUNT":
        return lit(n);
      case "AVERAGE":
        return app("divide", n === 0 ? lit(0) : balanced("add", values), lit(n));
      case "MIN":
      case "MAX":
        return n === 0 ? lit(0) : balanced(fn.toLowerCase(), values);
      case "ANY":
        return n === 0 ? lit(false) : balanced("or", values);
      case "ALL":
        return n === 0 ? lit(true) : balanced("and", values);
    }
  };

  const go = (a: Ast, s: Scope): Expr => {
    switch (a.k) {
      case "num":
        if (!Number.isFinite(a.v)) throw new FormulaSyntaxError("the number is too large", a.span);
        return lit(a.v);
      case "str":
      case "bool":
        return lit(a.v);
      case "name": {
        const head = a.nav[0];
        if (head?.t === "table") return lookup(a, head);
        const inTable = s.table;
        if (inTable !== undefined) {
          // In the axis of another table, `this.` reads the row of the formula: a variable that the axis binds before.
          if (a.nav[0]?.t === "this") {
            const own = column(a.name, a.span);
            const at = [origin, ...a.nav.slice(1).map(navMove)];
            const expr = own.formula ? cell(own.name, at) : ref([own.name], at);
            const id = JSON.stringify(expr);
            const known = inTable.hoist.get(id);
            if (known !== undefined) return v(known.name);
            const name = `$this${inTable.hoist.size}`;
            inTable.hoist.set(id, { name, expr });
            return v(name);
          }
          // Another name reads a column of that table. row(n). and parent. move in that table.
          const c = columnOf(inTable.name, inTable.cols, a.name, a.span);
          const at = a.nav.map((n) => (n.t === "key" ? key(n.name) : navMove(n)));
          return c.formula ? cell(c.name, at) : ref([c.name], at);
        }
        if (ctx.grid !== undefined && a.nav.length === 0 && ADDRESS.test(a.name)) return address(ctx.grid, a.name, a.span);
        // The navigation comes before the name in the text, so its errors come first.
        const at = [...s.base, ...a.nav.map(navMove)];
        const c = column(a.name, a.span);
        return c.formula ? cell(c.name, at) : ref([c.name], at);
      }
      case "neg":
        return a.arg.k === "num" ? lit(-a.arg.v) : app("negate", go(a.arg, s));
      case "binary": {
        const l = go(a.left, s);
        const r = go(a.right, s);
        if (a.op === "<>") return app("not", app("eq", l, r));
        // `&` joins the text of both values, as in a spreadsheet: the empty text takes the left value as text first.
        if (a.op === "&") return app("concat", app("concat", lit(""), l), r);
        return app(BINARY[a.op], l, r);
      }
      case "agg": {
        if (typeof a.axis === "object" && "range" in a.axis) return range(a.fn, a.axis.range.from, a.axis.range.to, a.span);
        if (typeof a.axis === "object" && "table" in a.axis) return overTable(a, a.axis.table, s);
        const inner: Scope = { base: [], inAggregate: true, ...(s.table === undefined ? {} : { table: s.table }) };
        const axis = a.where === undefined ? axisOf(a.axis) : axes.where(axisOf(a.axis), go(a.where, inner));
        const text = axisText(a.axis);
        if (a.body === undefined && a.fn !== "COUNT") throw new FormulaSyntaxError(`${a.fn} needs a value: write ${a.fn}(${text}.column) or ${a.fn}(${text}, value)`, a.span);
        const body = a.body === undefined ? lit(true) : go(a.body, inner);
        return app(AGGREGATES[a.fn], each(axis, body, [...s.base, ...a.nav.map(navMove)]), STRICT);
      }
      case "call":
        return call(a, s);
    }
  };

  // An aggregate over the rows of another table. The axis table moves the evaluation to that table, so a value of
  // the row of the formula comes in through a variable. The outermost axis of a table binds each variable in a let.
  const overTable = (a: Extract<Ast, { k: "agg" }>, name: string, s: Scope): Expr => {
    const cols = tableOf(name, a.span);
    const hoist = s.table?.hoist ?? new Map<string, { readonly name: string; readonly expr: Expr }>();
    const inner: Scope = { base: [], inAggregate: true, table: { name, cols, hoist } };
    const text = axisText(a.axis);
    const axis = a.where === undefined ? axes.table(name) : axes.where(axes.table(name), go(a.where, inner));
    if (a.body === undefined && a.fn !== "COUNT") throw new FormulaSyntaxError(`${a.fn} needs a value: write ${a.fn}(${text}.column) or ${a.fn}(${text}, value)`, a.span);
    const body = a.body === undefined ? lit(true) : go(a.body, inner);
    const agg = app(AGGREGATES[a.fn], each(axis, body), STRICT);
    if (s.table !== undefined || hoist.size === 0) return agg;
    return let_(Object.fromEntries([...hoist.values()].map((h) => [h.name, h.expr])), agg);
  };

  const call = (a: Extract<Ast, { k: "call" }>, s: Scope): Expr => {
    const name = a.fn.toUpperCase();
    const args = (): Expr[] => a.args.map((x) => go(x, s));
    const arity = (min: number, max: number): void => {
      if (a.args.length < min || a.args.length > max) {
        const want = min === max ? `${min}` : max === Infinity ? `${min} or more` : `${min} to ${max}`;
        throw new FormulaSyntaxError(`${name} needs ${want} argument${want === "1" ? "" : "s"}, not ${a.args.length}`, a.fnSpan);
      }
    };
    switch (name) {
      case "IF": {
        arity(2, 3);
        const [c, t, e] = args();
        return app("if", c ?? lit(false), t ?? lit(false), e ?? lit(false));
      }
      case "IFERROR":
        arity(2, 2);
        return app("ifError", ...args());
      case "AND":
      case "OR":
        arity(1, Infinity);
        return app(name.toLowerCase(), ...args());
      case "NOT":
        arity(1, 1);
        return app("not", ...args());
      case "VEC": {
        // VEC(x, y) is (1, 0) * x + (0, 1) * y, so it uses only the ops of Vec2.
        arity(2, 2);
        const [x, y] = args();
        return app("add", app("scale", lit(new Vec2(1, 0)), x ?? lit(0)), app("scale", lit(new Vec2(0, 1)), y ?? lit(0)));
      }
      case "X":
      case "Y": {
        // X(v) and Y(v) are dot products with the unit vectors, so they use only the ops of Vec2.
        arity(1, 1);
        const [vec] = args();
        return app("dot", vec ?? lit(0), lit(name === "X" ? new Vec2(1, 0) : new Vec2(0, 1)));
      }
      case "DATE":
        arity(3, 3);
        return app("date", ...args());
      case "YEAR":
      case "MONTH":
      case "DAY":
      case "WEEKDAY":
        arity(1, 1);
        return app(name.toLowerCase(), ...args());
      case "EDATE":
      case "EOMONTH":
        arity(2, 2);
        return app(name === "EDATE" ? "addMonths" : "endOfMonth", ...args());
      case "PMT":
      case "FV":
      case "PV":
      case "NPER":
        arity(3, 5);
        return finance(name, args());
      case "RANK": {
        arity(1, 1);
        if (s.inAggregate) throw new FormulaSyntaxError("RANK is not valid inside an aggregate", a.fnSpan);
        const x = a.args[0] as Ast;
        // In the test of the others axis, the focus is the other row. The prefix "origin" reads at the row of the formula.
        const atOther = go(x, { base: [], inAggregate: true });
        const atRow = go(x, { base: [...s.base, origin], inAggregate: true });
        const larger = each(axes.where(axes.others, app("gt", atOther, atRow)), lit(true), s.base);
        return app("add", app("count", larger, STRICT), lit(1));
      }
      default: {
        if (BUILT_IN_NAMES.has(name)) {
          // An aggregate without an axis. MIN, MAX and SUM are also ops of domains, for example MIN(a, b).
          const op = OP_NAMES.get(name.toLowerCase());
          if (op === undefined) throw new FormulaSyntaxError(`${name} needs an axis as its first argument, for example ${name}(children.cost)`, a.fnSpan);
          arity(1, Infinity);
          return app(op, ...args());
        }
        const op = OP_NAMES.get(name.toLowerCase());
        if (op === undefined) throw new FormulaSyntaxError(`the function "${a.fn}" does not exist`, a.fnSpan);
        arity(1, Infinity);
        return app(op, ...args());
      }
    }
  };

  try {
    const expr = go(ast, { base: [], inAggregate: false });
    return { ok: true, expr, reads };
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return { ok: false, error: { message: e.message, span: e.span } };
    throw e;
  }
}

/** This function compiles a formula text. A problem gives a result with an error and its span. */
export function compileFormula(text: string, ctx: FormulaContext): CompileResult {
  let ast: Ast;
  try {
    ast = parseFormula(text);
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return { ok: false, error: { message: e.message, span: e.span } };
    throw e;
  }
  return compileAst(ast, ctx);
}
