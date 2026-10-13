/**
 * The syntax of the formula language: the tokens, the syntax tree and the parser. The parser uses the order of the
 * operators of a spreadsheet. A minus sign before a value comes first. Then come `^`, then `*` and `/`, then `+`
 * and `-`, then `&`, and last the comparisons. Each node of the tree has the span of its text, for error messages.
 */

/** A part of the source text, from `start` to `end` (not included). */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** An error of a formula: a message and the span of the text that has the problem. */
export class FormulaSyntaxError extends Error {
  readonly span: Span;
  constructor(message: string, span: Span) {
    super(message);
    this.name = "FormulaSyntaxError";
    this.span = span;
  }
}

/** The longest formula that the reader accepts, so a pasted text cannot block the page. */
export const MAX_LENGTH = 10_000;

/** The deepest nesting of a formula: parentheses, function calls and signs (FORMULA.NESTING). */
export const MAX_NESTING = 200;

export type Token =
  | { readonly t: "num"; readonly v: number; readonly span: Span }
  | { readonly t: "str"; readonly v: string; readonly span: Span }
  | { readonly t: "id"; readonly v: string; readonly span: Span }
  | { readonly t: "bracket"; readonly v: string; readonly span: Span }
  | { readonly t: "op"; readonly v: string; readonly span: Span }
  | { readonly t: "punct"; readonly v: "(" | ")" | "," | "."; readonly span: Span }
  | { readonly t: "end"; readonly span: Span };

/** The operators, longest first, so `<=` is one token and not `<` and `=`. */
export const OPERATORS = ["<=", ">=", "<>", "<", ">", "=", "+", "-", "*", "/", "^", "&"] as const;
const PUNCT = ["(", ")", ",", "."] as const;
const ID_START = /[\p{L}_]/u;
const ID_PART = /[\p{L}\p{N}_]/u;

/** This function splits a formula into tokens. White space is not a token. A problem gives a `FormulaSyntaxError`. */
export function tokenize(src: string): readonly Token[] {
  if (src.length > MAX_LENGTH) throw new FormulaSyntaxError(`the formula is too long: the limit is ${MAX_LENGTH} characters`, { start: MAX_LENGTH, end: src.length });
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const start = i;
    const num = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num !== null) {
      i += num[0].length;
      out.push({ t: "num", v: Number(num[0]), span: { start, end: i } });
      continue;
    }
    if (c === '"') {
      // A text in double quotes. Two quotes in the text are one quote, as in a spreadsheet.
      let v = "";
      i++;
      for (;;) {
        if (i >= src.length) throw new FormulaSyntaxError("the text has no closing quote", { start, end: src.length });
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            v += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += src[i];
        i++;
      }
      out.push({ t: "str", v, span: { start, end: i } });
      continue;
    }
    if (c === "[") {
      const close = src.indexOf("]", i + 1);
      if (close < 0) throw new FormulaSyntaxError("the column name has no closing bracket", { start, end: src.length });
      const v = src.slice(i + 1, close);
      i = close + 1;
      if (v.trim() === "") throw new FormulaSyntaxError("the brackets have no column name", { start, end: i });
      out.push({ t: "bracket", v, span: { start, end: i } });
      continue;
    }
    if (ID_START.test(c)) {
      while (i < src.length && ID_PART.test(src[i] ?? "")) i++;
      out.push({ t: "id", v: src.slice(start, i), span: { start, end: i } });
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op !== undefined) {
      i += op.length;
      out.push({ t: "op", v: op, span: { start, end: i } });
      continue;
    }
    const p = PUNCT.find((x) => x === c);
    if (p !== undefined) {
      i++;
      out.push({ t: "punct", v: p, span: { start, end: i } });
      continue;
    }
    throw new FormulaSyntaxError(`"${c}" is not part of a formula`, { start, end: i + 1 });
  }
  out.push({ t: "end", span: { start: src.length, end: src.length } });
  return out;
}

/** A step of navigation before a column name: `this.`, `parent.`, `row(n).` or `row("name").`. */
export type Nav =
  | { readonly t: "this" }
  | { readonly t: "parent" }
  | { readonly t: "row"; readonly n: number }
  | { readonly t: "key"; readonly name: string; readonly span: Span };

/** The axes of an aggregate. */
export const AXES = ["children", "descendants", "ancestors", "siblings", "others", "all"] as const;
export type AxisName = (typeof AXES)[number];

/** The axis of an aggregate: a named axis, or `rows(from, to)`, the rows at the offsets from `from` to `to`. */
export type AggAxis = AxisName | { readonly from: number; readonly to: number };

/** This function gives the text of the axis of an aggregate, as a formula writes it. */
export const axisText = (a: AggAxis): string => (typeof a === "string" ? a : `rows(${a.from}, ${a.to})`);

/** The aggregates: a function of the values of an axis. */
export const AGGREGATES = { SUM: "sum", AVERAGE: "mean", MIN: "min", MAX: "max", COUNT: "count", ANY: "any", ALL: "all" } as const;
export type AggregateName = keyof typeof AGGREGATES;

export type BinaryOp = "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=";

/** The syntax tree of a formula. */
export type Ast =
  | { readonly k: "num"; readonly v: number; readonly span: Span }
  | { readonly k: "str"; readonly v: string; readonly span: Span }
  | { readonly k: "bool"; readonly v: boolean; readonly span: Span }
  | { readonly k: "name"; readonly nav: readonly Nav[]; readonly name: string; readonly span: Span }
  | { readonly k: "neg"; readonly arg: Ast; readonly span: Span }
  | { readonly k: "binary"; readonly op: BinaryOp; readonly left: Ast; readonly right: Ast; readonly span: Span }
  | { readonly k: "call"; readonly fn: string; readonly fnSpan: Span; readonly args: readonly Ast[]; readonly span: Span }
  | {
      readonly k: "agg";
      readonly fn: AggregateName;
      readonly fnSpan: Span;
      readonly nav: readonly Nav[];
      readonly axis: AggAxis;
      readonly where?: Ast;
      readonly body?: Ast;
      readonly span: Span;
    };

const PRECEDENCE: Readonly<Record<BinaryOp, number>> = { "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

const isWord = (tok: Token | undefined, word: string): boolean => tok?.t === "id" && tok.v.toLowerCase() === word;
const isPunct = (tok: Token | undefined, p: string): boolean => tok?.t === "punct" && tok.v === p;
const isAxis = (tok: Token | undefined): boolean => tok?.t === "id" && (AXES as readonly string[]).includes(tok.v.toLowerCase());

/** This function reads a formula. An optional `=` can start it. A problem gives a `FormulaSyntaxError`. */
export function parseFormula(src: string): Ast {
  const toks = tokenize(src);
  let i = 0;
  const peek = (d = 0): Token => toks[Math.min(i + d, toks.length - 1)] ?? { t: "end", span: { start: src.length, end: src.length } };
  const next = (): Token => {
    const t = peek();
    if (t.t !== "end") i++;
    return t;
  };
  const expect = (p: string, what: string): Token => {
    const t = peek();
    if (!isPunct(t, p)) throw new FormulaSyntaxError(`${what} is necessary here`, t.span);
    return next();
  };
  const describe = (t: Token): string => (t.t === "end" ? "the end of the formula" : `"${src.slice(t.span.start, t.span.end)}"`);

  // The navigation steps before a name or an axis: this., parent., row(n). and row("name").
  const navLength = (from: number): number => {
    let j = from;
    for (;;) {
      const t = toks[j];
      if ((isWord(t, "this") || isWord(t, "parent")) && isPunct(toks[j + 1], ".")) {
        j += 2;
        continue;
      }
      if (isWord(t, "row") && isPunct(toks[j + 1], "(")) {
        let k = j + 2;
        if (toks[k]?.t === "str" && isPunct(toks[k + 1], ")") && isPunct(toks[k + 2], ".")) {
          j = k + 3;
          continue;
        }
        const sign = toks[k];
        if (sign?.t === "op" && (sign.v === "-" || sign.v === "+")) k++;
        if (toks[k]?.t === "num" && isPunct(toks[k + 1], ")") && isPunct(toks[k + 2], ".")) {
          j = k + 3;
          continue;
        }
      }
      return j - from;
    }
  };
  // navLength has checked the tokens of each step, so this function reads them without more checks.
  const parseNav = (): Nav[] => {
    const out: Nav[] = [];
    for (let steps = navLength(i); steps > 0; steps = navLength(i)) {
      const t = next();
      if (isWord(t, "this")) out.push({ t: "this" });
      else if (isWord(t, "parent")) out.push({ t: "parent" });
      else {
        next(); // "("
        const arg = peek();
        if (arg.t === "str") {
          next();
          out.push({ t: "key", name: arg.v, span: arg.span });
        } else {
          const sign = arg.t === "op" && arg.v === "-" ? -1 : 1;
          if (arg.t === "op") next();
          const n = next();
          const v = n.t === "num" ? n.v : Number.NaN;
          if (!Number.isInteger(v)) throw new FormulaSyntaxError("the row offset must be a whole number", n.span);
          out.push({ t: "row", n: sign * v });
        }
        next(); // ")"
      }
      next(); // "."
    }
    return out;
  };
  const parseName = (start: number, nav: readonly Nav[]): Ast => {
    const t = next();
    if (t.t === "bracket") return { k: "name", nav, name: t.v.trim(), span: { start, end: t.span.end } };
    if (t.t === "id") {
      if (isAxis(t)) throw new FormulaSyntaxError(`"${t.v}" is an axis. An axis is valid only as the first argument of an aggregate, for example SUM(${t.v}.cost)`, t.span);
      return { k: "name", nav, name: t.v, span: { start, end: t.span.end } };
    }
    throw new FormulaSyntaxError(`a column name is necessary after the navigation, not ${describe(t)}`, t.span);
  };

  // A whole number with an optional sign, for an offset of rows(from, to).
  const parseOffset = (): number => {
    const sign = peek();
    if (sign.t === "op" && (sign.v === "-" || sign.v === "+")) next();
    const n = next();
    const v = (sign.t === "op" && sign.v === "-" ? -1 : 1) * (n.t === "num" ? n.v : Number.NaN);
    if (!Number.isSafeInteger(v)) throw new FormulaSyntaxError("the offsets of rows(from, to) must be whole numbers", n.span);
    return v;
  };

  const parseAggregate = (fn: AggregateName, fnTok: Token): Ast => {
    const nav = parseNav();
    const axisTok = next() as Extract<Token, { t: "id" }>;
    let axis: AggAxis = axisTok.v.toLowerCase() as AxisName;
    if (isWord(axisTok, "rows")) {
      next(); // "("
      const from = parseOffset();
      expect(",", `"," between the two offsets of rows(from, to)`);
      const to = parseOffset();
      expect(")", `")" after the offsets of rows(from, to)`);
      axis = { from, to };
    }
    let body: Ast | undefined;
    if (isPunct(peek(), ".")) {
      next();
      body = parseName(peek().span.start, []);
    }
    let where: Ast | undefined;
    if (isWord(peek(), "where")) {
      next();
      where = parseExpr(0);
    }
    if (isPunct(peek(), ",")) {
      if (body !== undefined) throw new FormulaSyntaxError(`${fn} has a column after the axis, so it takes no second argument`, peek().span);
      next();
      body = parseExpr(0);
    }
    const close = expect(")", `")" after the arguments of ${fn}`);
    return {
      k: "agg",
      fn,
      fnSpan: fnTok.span,
      nav,
      axis,
      ...(where === undefined ? {} : { where }),
      ...(body === undefined ? {} : { body }),
      span: { start: fnTok.span.start, end: close.span.end },
    };
  };

  const parseCall = (fnTok: Extract<Token, { t: "id" }>): Ast => {
    next(); // the function name
    next(); // "("
    const upper = fnTok.v.toUpperCase();
    // The axis "all" and the function ALL have one name. An axis name before "(" is a function, not an axis. The
    // axis rows(from, to) is the exception: it has its offsets in parentheses.
    const axisAt = i + navLength(i);
    const named = isAxis(toks[axisAt]) && !isPunct(toks[axisAt + 1], "(");
    const rows = isWord(toks[axisAt], "rows") && isPunct(toks[axisAt + 1], "(");
    if (upper in AGGREGATES && (named || rows)) return parseAggregate(upper as AggregateName, fnTok);
    const args: Ast[] = [];
    if (!isPunct(peek(), ")")) {
      for (;;) {
        args.push(parseExpr(0));
        if (!isPunct(peek(), ",")) break;
        next();
      }
    }
    const close = expect(")", `")" after the arguments of ${fnTok.v}`);
    return { k: "call", fn: fnTok.v, fnSpan: fnTok.span, args, span: { start: fnTok.span.start, end: close.span.end } };
  };

  const parsePrimary = (): Ast => {
    const t = peek();
    switch (t.t) {
      case "num":
        next();
        return { k: "num", v: t.v, span: t.span };
      case "str":
        next();
        return { k: "str", v: t.v, span: t.span };
      case "bracket":
        return parseName(t.span.start, []);
      case "id": {
        const nav = navLength(i);
        if (nav > 0) {
          const start = t.span.start;
          return parseName(start, parseNav());
        }
        if (isPunct(peek(1), "(")) return parseCall(t);
        if (isWord(t, "true") || isWord(t, "false")) {
          next();
          return { k: "bool", v: t.v.toLowerCase() === "true", span: t.span };
        }
        return parseName(t.span.start, []);
      }
      case "punct":
        if (t.v === "(") {
          next();
          const inner = parseExpr(0);
          const close = expect(")", `")"`);
          return { ...inner, span: { start: t.span.start, end: close.span.end } };
        }
        throw new FormulaSyntaxError(`a value is necessary here, not ${describe(t)}`, t.span);
      case "op":
      case "end":
        throw new FormulaSyntaxError(`a value is necessary here, not ${describe(t)}`, t.span);
    }
  };

  // The parser uses recursion, so a limit on the nesting keeps the call stack small in each engine (EVAL.NESTING).
  let depth = 0;
  const deeper = <T>(at: Span, f: () => T): T => {
    if (++depth > MAX_NESTING) throw new FormulaSyntaxError(`the formula is nested more than ${MAX_NESTING} levels deep`, at);
    try {
      return f();
    } finally {
      depth--;
    }
  };

  const parseUnary = (): Ast => {
    const t = peek();
    if (t.t === "op" && (t.v === "-" || t.v === "+")) {
      next();
      // Each sign is one level: a chain of signs is a chain of recursive calls.
      const arg = deeper(t.span, parseUnary);
      return t.v === "+" ? { ...arg, span: { start: t.span.start, end: arg.span.end } } : { k: "neg", arg, span: { start: t.span.start, end: arg.span.end } };
    }
    return parsePrimary();
  };

  const parseExpr = (min: number): Ast => deeper(peek().span, () => parseExprAt(min));
  const parseExprAt = (min: number): Ast => {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t.t !== "op" || !(t.v in PRECEDENCE)) return left;
      const op = t.v as BinaryOp;
      const prec = PRECEDENCE[op];
      if (prec < min) return left;
      next();
      // Each binary operator is left-associative, also `^`, as in a spreadsheet.
      const right = parseExpr(prec + 1);
      left = { k: "binary", op, left, right, span: { start: left.span.start, end: right.span.end } };
    }
  };

  if (peek().t === "op" && (peek() as { v: string }).v === "=") next();
  if (peek().t === "end") throw new FormulaSyntaxError("the formula is empty", peek().span);
  // The formula itself is not a level: each parenthesis, argument and sign in it is one level.
  const ast = parseExprAt(0);
  const rest = peek();
  if (rest.t !== "end") throw new FormulaSyntaxError(`${describe(rest)} is not expected here`, rest.span);
  return ast;
}
