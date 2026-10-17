/**
 * The view of an expression as a Vex chain: the text of the "show as Vex" view of the sheet app. The Lab reader
 * reads the text, and the chain that it gives has the same result as the expression.
 *
 * Each part of the text starts at `root`. A field reference of `root` reads at the focus when the chain evaluates,
 * so a body of an axis can also start at `root`. A cell reference is the argument `root.ext("vex.cell", ...)`.
 */
import { isListOp, type Axis, type Expr, type Move, type Names } from "@mark1russell7/vex";

/** This function gives the text of a string in double quotes, for the Lab reader. */
const quote = (s: string): string => `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\t", "\\t")}"`;

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** The text of a number or a boolean. `String(-0)` is "0", so -0 gets its own text. */
const scalar = (u: number | boolean): string => (Object.is(u, -0) ? "-0" : String(u));

/** This function gives the text of JSON data, for a literal or the data of an extension. */
function literal(u: unknown): string {
  if (u === null) return "null";
  if (typeof u === "boolean" || typeof u === "number") return scalar(u);
  if (typeof u === "string") return quote(u);
  if (Array.isArray(u)) return `[${u.map(literal).join(", ")}]`;
  if (typeof u === "object") {
    const fields = Object.entries(u as Record<string, unknown>).map(([k, v]) => `${IDENT.test(k) ? k : quote(k)}: ${literal(v)}`);
    return fields.length === 0 ? "{}" : `{ ${fields.join(", ")} }`;
  }
  return "null";
}

const move = (m: Move): string => {
  switch (m.t) {
    // A computed key or position is a chain that evaluates at the focus before the moves. A number would be a fixed
    // position, which must be whole.
    case "key":
      return `.to(${typeof m.key === "string" ? quote(m.key) : chain(m.key)})`;
    case "index":
      return `.index(${typeof m.i === "number" ? String(m.i) : chain(m.i)})`;
    case "offset":
      return `.offset(${m.d.join(", ")})`;
    case "other":
    case "origin":
    case "parent":
      return `.${m.t}()`;
  }
};
const moves = (at: readonly Move[] | undefined): string => (at ?? []).map(move).join("");

/** This function replaces each bound name of `e` with its expression. A pure expression keeps its result. */
function inline(e: Expr, env: ReadonlyMap<string, Expr>): Expr {
  switch (e.tag) {
    case "var":
      return env.get(e.name) ?? e;
    case "let": {
      const inner = new Map(env);
      for (const [n, b] of Object.entries(e.bind)) inner.set(n, inline(b, env));
      return inline(e.body, inner);
    }
    case "app":
      return { ...e, args: e.args.map((a) => inline(a, env)) };
    case "rec":
      return { ...e, fields: Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, inline(v, env)])) };
    case "each":
      return { ...e, body: inline(e.body, env), axis: inlineAxis(e.axis, env) };
    // The names of a loop hide a binding outside it with the same name, in the steps and in the result.
    case "fold": {
      const inside = without(env, Object.keys(e.init));
      return { ...e, axis: inlineAxis(e.axis, env), init: inlineNames(e.init, env), step: inlineNames(e.step, inside), result: inline(e.result, inside) };
    }
    case "iterate": {
      const inside = without(env, Object.keys(e.init));
      const inlined = { ...e, init: inlineNames(e.init, env), step: inlineNames(e.step, inside), result: inline(e.result, inside) };
      return e.until === undefined ? inlined : { ...inlined, until: inline(e.until, inside) };
    }
    case "lit":
    case "ref":
    case "ext":
      return e;
  }
}
const inlineAxis = (a: Axis, env: ReadonlyMap<string, Expr>): Axis => (a.t === "where" ? { t: "where", axis: inlineAxis(a.axis, env), test: inline(a.test, env) } : a);
const inlineNames = (names: Names, env: ReadonlyMap<string, Expr>): Names => Object.fromEntries(Object.entries(names).map(([n, x]) => [n, inline(x, env)]));
const without = (env: ReadonlyMap<string, Expr>, names: readonly string[]): ReadonlyMap<string, Expr> => new Map([...env].filter(([n]) => !names.includes(n)));

/** The text of each name of the loops around a part of the view, for example "v0.x". */
let loopText: ReadonlyMap<string, string> = new Map();
/** The number of loops around a part of the view. The parameter of a loop is "v" and this number. */
let loopDepth = 0;

/** This function gives the field of a name of a loop. A name of a formula has the form "@x", and its field is "x". */
const fieldOf = (name: string, i: number): string => (IDENT.test(name.replace(/^@/, "")) ? name.replace(/^@/, "") : `n${String(i)}`);

/** This function gives the text of the parts of a loop, with the text of its names in their scope. */
function inLoop(fields: ReadonlyMap<string, string>, parts: (param: string) => string): string {
  const param = `v${String(loopDepth)}`;
  const outer = loopText;
  loopText = new Map([...outer, ...[...fields].map(([n, f]): [string, string] => [n, `${param}.${f}`])]);
  loopDepth++;
  try {
    return parts(param);
  } finally {
    loopText = outer;
    loopDepth--;
  }
}

/** The text of a record of the names of a loop: each field and the text of its value. */
const namesText = (fields: ReadonlyMap<string, string>, names: Names): string => `{ ${Object.entries(names).map(([n, x]) => `${fields.get(n) ?? n}: ${arg(x)}`).join(", ")} }`;

/**
 * The text of a loop: an iteration of a chain, or a fold of a list chain. The first values and the tests of a fold
 * have the text outside the loop, because they cannot read its names.
 */
function loop(e: Extract<Expr, { tag: "fold" | "iterate" }>): string {
  const fields = new Map(Object.keys(e.init).map((n, i) => [n, fieldOf(n, i)] as const));
  const first = namesText(fields, e.init);
  const head = e.tag === "iterate" ? `root.start(0).iterate(${String(e.limit)}, ` : `${list({ tag: "each", axis: e.axis, body: { tag: "lit", value: 0 }, ...(e.at === undefined ? {} : { at: e.at }) })}.fold(`;
  return inLoop(fields, (p) => {
    const until = e.tag === "iterate" && e.until !== undefined ? `, { until: (${p}) => ${arg(e.until)} }` : "";
    return `${head}${first}, (${p}) => (${namesText(fields, e.step)}), (${p}) => ${arg(e.result)}${until})`;
  });
}

/** The text of an argument of an op: a number or a boolean as it is, and another expression as a chain. */
function arg(e: Expr): string {
  if (e.tag === "lit") return typeof e.value === "number" || typeof e.value === "boolean" ? scalar(e.value) : `root.lit(${literal(e.value)})`;
  if (e.tag === "ext") return `root.ext(${quote(e.kind)}, ${literal(e.data)})`;
  if (e.tag === "rec") return `root.rec({ ${Object.entries(e.fields).map(([k, v]) => `${IDENT.test(k) ? k : quote(k)}: ${arg(v)}`).join(", ")} })`;
  return chain(e);
}

/** The text of a list chain: the axis, its body and its test. */
function list(e: Extract<Expr, { tag: "each" }>): string {
  const tests: Expr[] = [];
  let axis = e.axis;
  while (axis.t === "where") {
    tests.unshift(axis.test);
    axis = axis.axis;
  }
  // The reverse order is the option reverse of the axis inside it.
  const reverse = axis.t === "reverse";
  // The validation of the IR keeps a base axis inside reverse.
  const base = (axis.t === "reverse" ? axis.axis : axis) as Exclude<Axis, { readonly t: "where" | "reverse" }>;
  const body = `(c) => ${chain(e.body)}`;
  const [first, ...more] = tests;
  const opts = [...(first === undefined ? [] : [`where: (c) => ${chain(first)}${more.length === 0 ? "" : `._.and(${more.map(arg).join(", ")})`}`]), ...(reverse ? ["reverse: true"] : [])];
  const where = opts.length === 0 ? "" : `, { ${opts.join(", ")} }`;
  const head = `root.start(0)${moves(e.at)}`;
  switch (base.t) {
    case "all":
      return `${head}.each(${body}${where})`;
    case "neighbors":
      return `${head}.neighbors(${base.n}, ${body}${where})`;
    case "other":
    case "others":
      return `${head}.others(${body}${where})`;
    case "children":
    case "ancestors":
    case "descendants":
    case "siblings":
    case "successors":
    case "predecessors":
    case "reachable":
      return `${head}.${base.t}(${body}${where})`;
    case "window":
      return `${head}.window(${base.from}, ${base.to}, ${body}${where})`;
    case "table":
      return `${head}.table(${quote(base.name)}, ${body}${where})`;
  }
}

/** The text of a chain whose value is the value of `e`. */
function chain(e: Expr): string {
  switch (e.tag) {
    case "lit":
      return typeof e.value === "number" || typeof e.value === "boolean" ? `root.start(${scalar(e.value)})` : `root.start(${arg(e)})`;
    case "ref": {
      const path = quote(e.path.join("."));
      return e.at === undefined || e.at.length === 0 ? `root.from(${path})` : `root.start(0)${moves(e.at)}.from(${path})`;
    }
    case "ext":
    case "rec":
      return `root.start(${arg(e)})`;
    case "each":
      return list(e);
    case "app": {
      const [first, ...rest] = e.args;
      if (first?.tag === "each" && isListOp(e.op)) return `${list(first)}.${e.op}(${rest.map((r) => (r.tag === "lit" ? literal(r.value) : arg(r))).join(", ")})`;
      return `${first === undefined ? "root.start(null)" : chain(first)}._.${e.op}(${rest.map(arg).join(", ")})`;
    }
    case "let":
      return chain(inline(e, new Map()));
    case "var":
      return loopText.get(e.name) ?? "root.start(null)";
    case "fold":
    case "iterate":
      return loop(e);
  }
}

/** This function gives the text of an expression as a Vex chain, in the syntax of the Lab reader. */
export function toVexChain(expr: Expr): string {
  return chain(expr);
}
