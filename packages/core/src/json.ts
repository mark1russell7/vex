import { decodeValue, encodeValue, isRecord } from "./codec.ts";
import { fromDocument, isDocument } from "./document.ts";
import type { AnyDomain } from "./domain.ts";
import { isStackOverflow, vexError } from "./errors.ts";
import { isExpr, type Expr } from "./ir.ts";
import { fail, ok, type Result } from "./result.ts";

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
      const entries: [string, unknown][] = [];
      for (const [k, x] of Object.entries(list)) {
        const r = mapValues(x, f);
        if (!r.ok) return r;
        entries.push([k, r.value]);
      }
      // A binding or a field with the name "__proto__" is an own field too (V-062).
      out[key] = Object.fromEntries(entries);
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

/**
 * This function reads an expression from JSON text. It checks the whole tree. The text can also be a document: then
 * `fromDocument` reads it (DOC.ENTRY).
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain decodes no value
export function parse(text: string, domains: readonly AnyDomain[] = []): Result<Expr> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (thrown) {
    return fail(vexError("bad-expression", "the text is not JSON", { thrown }));
  }
  if (isDocument(raw)) {
    const read = fromDocument(raw, domains);
    // The JSON form needs whole numbers in the moves and the windows, as isExpr does.
    return !read.ok || isExpr(read.value) ? read : fail(vexError("bad-expression", "the JSON is not a valid Vex expression"));
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
