import type { AnyDomain } from "./domain.ts";
import { isStackOverflow, vexError } from "./errors.ts";
import { isExpr, type Expr } from "./ir.ts";
import { fail, ok, type Result } from "./result.ts";

/**
 * The JSON form of the values in a literal. JSON data stays as it is, with three exceptions. Each exception is a record
 * with the key `$vex`:
 *
 * - `{ "$vex": "domain", "domain": name, "value": v }`: a value of a domain, with the `encode` of the domain.
 * - `{ "$vex": "number", "value": "-0" }`: a number that JSON has no text for: `-0`, `NaN`, `Infinity` or `-Infinity`.
 * - `{ "$vex": "escape", "value": record }`: a record of the data that has the key `$vex` itself (IR.JSON.ESCAPE).
 *
 * A record with the key `$vex` and another form stays data, so a file from an older version reads as before.
 *
 * The functions walk the tree of the expression, so only the value of a literal gets this form. A field of a literal
 * that looks like an expression stays data. The data of an extension is plain JSON, as before.
 */
type Encoded =
  | { readonly $vex: "domain"; readonly domain: string; readonly value: unknown }
  | { readonly $vex: "number"; readonly value: "-0" | "NaN" | "Infinity" | "-Infinity" }
  | { readonly $vex: "escape"; readonly value: Readonly<Record<string, unknown>> };

const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null && !Array.isArray(u);

const isPlainRecord = (u: unknown): u is Readonly<Record<string, unknown>> => {
  if (!isRecord(u)) return false;
  const proto: unknown = Object.getPrototypeOf(u);
  return proto === Object.prototype || proto === null;
};

/** This function gives the JSON form of a value, or the reason why the value has no JSON form. */
function encodeValue(u: unknown, domains: readonly AnyDomain[]): Result<unknown> {
  if (u === null || typeof u === "string" || typeof u === "boolean") return ok(u);
  if (typeof u === "number") {
    if (Object.is(u, -0)) return ok({ $vex: "number", value: "-0" } satisfies Encoded);
    // Stryker disable next-line EqualityOperator: here u is an infinity, so u > 0 and u >= 0 are the same test
    return Number.isFinite(u) ? ok(u) : ok({ $vex: "number", value: Number.isNaN(u) ? "NaN" : u > 0 ? "Infinity" : "-Infinity" } satisfies Encoded);
  }
  if (Array.isArray(u)) {
    const out: unknown[] = [];
    for (const x of u) {
      const r = encodeValue(x, domains);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(out);
  }
  if (isPlainRecord(u)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(u)) {
      const r = encodeValue(x, domains);
      if (!r.ok) return r;
      out[k] = r.value;
    }
    return ok(Object.hasOwn(u, "$vex") ? ({ $vex: "escape", value: out } satisfies Encoded) : out);
  }
  // A plain array or record stays data. Another object is a value of a domain, or it has no JSON form.
  const d = domains.find((dom) => dom.encode !== undefined && dom.is(u));
  if (d?.encode !== undefined) return ok({ $vex: "domain", domain: d.name, value: d.encode(u) } satisfies Encoded);
  return fail(vexError("bad-expression", "a literal value is not JSON data and no domain encodes it"));
}

const NUMBERS: Readonly<Record<string, number>> = { "-0": -0, NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, "-Infinity": Number.NEGATIVE_INFINITY };

/** This function reads a value from its JSON form. */
function decodeValue(u: unknown, domains: readonly AnyDomain[]): Result<unknown> {
  if (Array.isArray(u)) {
    const out: unknown[] = [];
    for (const x of u) {
      const r = decodeValue(x, domains);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(out);
  }
  if (!isRecord(u)) return ok(u);
  const fields = (record: Readonly<Record<string, unknown>>): Result<unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(record)) {
      const r = decodeValue(x, domains);
      if (!r.ok) return r;
      out[k] = r.value;
    }
    return ok(out);
  };
  // A record without the key $vex matches none of the forms below, so it stays data too.
  const kind = u["$vex"];
  if (kind === "escape" && isRecord(u["value"])) return fields(u["value"]);
  if (kind === "number" && typeof u["value"] === "string" && Object.hasOwn(NUMBERS, u["value"])) return ok(NUMBERS[u["value"]]);
  if (kind === "domain" && typeof u["domain"] === "string") {
    const name = u["domain"];
    const d = domains.find((dom) => dom.name === name);
    if (d?.decode === undefined) return fail(vexError("bad-expression", `no domain "${name}" decodes a literal`));
    return ok(d.decode(u["value"]));
  }
  // A form that this version does not know stays data, so a file from an older version reads as before.
  return fields(u);
}

/** This function applies `f` to each literal value of a JSON tree of an expression. */
function mapValues(u: unknown, f: (value: unknown) => Result<unknown>): Result<unknown> {
  if (!isRecord(u)) return ok(u);
  const out: Record<string, unknown> = { ...u };
  const child = (key: string): Result<unknown> | undefined => {
    const r = mapValues(u[key], f);
    if (r.ok) out[key] = r.value;
    return r.ok ? undefined : r;
  };
  const each = (key: string): Result<unknown> | undefined => {
    const list = u[key];
    if (Array.isArray(list)) {
      const items: unknown[] = [];
      for (const x of list) {
        const r = mapValues(x, f);
        if (!r.ok) return r;
        items.push(r.value);
      }
      out[key] = items;
    } else if (isRecord(list)) {
      const rec: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(list)) {
        const r = mapValues(x, f);
        if (!r.ok) return r;
        rec[k] = r.value;
      }
      out[key] = rec;
    }
    return undefined;
  };
  // The expression of a computed move is a tree of the expression too (NAV.COMPUTED).
  const address = (): Result<unknown> | undefined => {
    const at = u["at"];
    if (!Array.isArray(at)) return undefined;
    const moves: unknown[] = [];
    for (const m of at) {
      const field = isRecord(m) ? (m["t"] === "key" ? "key" : m["t"] === "index" ? "i" : undefined) : undefined;
      if (field === undefined || !isRecord(m) || !isRecord(m[field])) {
        moves.push(m);
        continue;
      }
      const r = mapValues(m[field], f);
      if (!r.ok) return r;
      moves.push({ ...m, [field]: r.value });
    }
    out["at"] = moves;
    return undefined;
  };
  // The test of where and the list of the axis list are expressions, also inside reverse.
  const axis = (a: unknown): Result<unknown> => {
    if (!isRecord(a)) return ok(a);
    if (a["t"] === "list") {
      const list = mapValues(a["list"], f);
      return list.ok ? ok({ ...a, list: list.value }) : list;
    }
    if (a["t"] === "reverse") {
      const inner = axis(a["axis"]);
      return inner.ok ? ok({ ...a, axis: inner.value }) : inner;
    }
    if (a["t"] !== "where") return ok(a);
    const inner = axis(a["axis"]);
    if (!inner.ok) return inner;
    const test = mapValues(a["test"], f);
    return test.ok ? ok({ ...a, axis: inner.value, test: test.value }) : test;
  };
  switch (u["tag"]) {
    case "lit": {
      if (!Object.hasOwn(u, "value")) return ok(out);
      const r = f(u["value"]);
      if (!r.ok) return r;
      out["value"] = r.value;
      return ok(out);
    }
    case "app":
      return each("args") ?? ok(out);
    case "let":
      return each("bind") ?? child("body") ?? ok(out);
    case "rec":
      return each("fields") ?? ok(out);
    case "each": {
      const a = axis(u["axis"]);
      if (!a.ok) return a;
      out["axis"] = a.value;
      return child("body") ?? address() ?? ok(out);
    }
    case "fold": {
      const a = axis(u["axis"]);
      if (!a.ok) return a;
      out["axis"] = a.value;
      return each("init") ?? each("step") ?? child("result") ?? address() ?? ok(out);
    }
    case "iterate":
      return each("init") ?? each("step") ?? (u["until"] === undefined ? undefined : child("until")) ?? child("result") ?? ok(out);
    case "fn":
      return child("body") ?? ok(out);
    case "call":
      return each("args") ?? ok(out);
    case "ref":
      return address() ?? ok(out);
    default:
      return ok(out);
  }
}

/**
 * This function gives the JSON text of an expression. A literal value that is a domain value needs a domain with
 * `encode`. A literal value that is not JSON data and has no such domain gives the error `#VALUE!`.
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain encodes no value
export function serialize(e: Expr, domains: readonly AnyDomain[] = []): Result<string> {
  try {
    // A getter of a literal value can throw, so the encoding is inside the try too.
    const tree = mapValues(e, (v) => encodeValue(v, domains));
    return tree.ok ? ok(JSON.stringify(tree.value)) : fail(tree.error);
  } catch (thrown) {
    if (isStackOverflow(thrown)) return fail(vexError("depth", "the expression is too deep for the call stack of the engine", { thrown }));
    return fail(vexError("threw", "the expression has no JSON form", { thrown }));
  }
}

/** This function reads an expression from JSON text. It checks the whole tree. */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain decodes no value
export function parse(text: string, domains: readonly AnyDomain[] = []): Result<Expr> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (thrown) {
    return fail(vexError("bad-expression", "the text is not JSON", { thrown }));
  }
  try {
    const tree = mapValues(raw, (v) => decodeValue(v, domains));
    if (!tree.ok) return fail(tree.error);
    return isExpr(tree.value) ? ok(tree.value) : fail(vexError("bad-expression", "the JSON is not a valid Vex expression"));
  } catch (thrown) {
    // A JSON text nested deeper than the call stack, or a decoder of a domain that throws.
    if (isStackOverflow(thrown)) return fail(vexError("depth", "the JSON is too deep for the call stack of the engine", { thrown }));
    return fail(vexError("threw", "a decoder of a domain threw an exception", { thrown }));
  }
}
