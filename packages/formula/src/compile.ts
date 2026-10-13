/**
 * The compiler of the formula language. It changes the syntax tree of a formula into an expression of the Vex IR.
 * A value column is a field of the row records, so a read of it is a `ref`. A formula column is a column of a
 * sheet, so a read of it is a cell reference. Thus a cycle of formula columns gives `#CYCLE!`.
 */
import { app, axes, cell, each, key, let_, lit, offset, origin, parent, ref, v, type Axis, type Expr, type Move } from "@mark1russell7/vex";
import { Vec2 } from "@mark1russell7/vex-domains";
import { BUILT_IN_NAMES, OP_NAMES } from "./functions.ts";
import { AGGREGATES, axisText, FormulaSyntaxError, parseFormula, type AggAxis, type Ast, type AxisName, type BinaryOp, type Nav, type Span } from "./syntax.ts";

/** The columns that a formula can read. */
export interface FormulaContext {
  /** The fields of the row records. A read of a value column is a `ref`. */
  readonly valueColumns: readonly string[];
  /** The other formula columns. A read of a formula column is a cell reference. */
  readonly formulaColumns: readonly string[];
  /** The keys of the rows with each name, for `row("name")`. Without this map, the name is the key of the row. */
  readonly rowNames?: ReadonlyMap<string, readonly string[]>;
}

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
const axisOf = (a: AggAxis): Axis => (typeof a === "string" ? AXIS[a] : axes.window(a.from, a.to));
const STRICT = lit({ strict: true });

/** Where a part of a formula evaluates. `base` comes before each address. `inAggregate` is true in an aggregate. */
interface Scope {
  readonly base: readonly Move[];
  readonly inAggregate: boolean;
}

/** This function compiles a syntax tree. A problem gives a result with an error. */
export function compileAst(ast: Ast, ctx: FormulaContext): CompileResult {
  const reads: string[] = [];
  const column = (name: string, span: Span): { readonly name: string; readonly formula: boolean } => {
    if (name.includes(".")) throw new FormulaSyntaxError(`a column name has no dot: "${name}"`, span);
    const lower = name.toLowerCase();
    const found =
      ctx.valueColumns.find((c) => c === name) ??
      ctx.formulaColumns.find((c) => c === name) ??
      ctx.valueColumns.find((c) => c.toLowerCase() === lower) ??
      ctx.formulaColumns.find((c) => c.toLowerCase() === lower);
    if (found === undefined) throw new FormulaSyntaxError(`the column "${name}" does not exist`, span);
    if (!reads.includes(found)) reads.push(found);
    return { name: found, formula: !ctx.valueColumns.includes(found) };
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
        const c = column(a.name, a.span);
        const at = [...s.base, ...a.nav.map(navMove)];
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
        const inner: Scope = { base: [], inAggregate: true };
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
