import type { AnyDomain } from "./domain.ts";
import { vexError } from "./errors.ts";
import { isExpr, type Expr } from "./ir.ts";
import { fail, ok, type Result } from "./result.ts";

/** The JSON form of a domain value inside a literal. */
interface EncodedValue {
  readonly $vex: "domain";
  readonly domain: string;
  readonly value: unknown;
}

const isPlainJson = (u: unknown): boolean => {
  if (u === null || typeof u === "string" || typeof u === "boolean") return true;
  if (typeof u === "number") return Number.isFinite(u);
  if (Array.isArray(u)) return u.every(isPlainJson);
  if (typeof u === "object") {
    const proto: unknown = Object.getPrototypeOf(u);
    return (proto === Object.prototype || proto === null) && Object.values(u).every(isPlainJson);
  }
  return false;
};

/**
 * This function gives the JSON text of an expression. A literal that is a domain value needs a domain with
 * `encode`. A literal that is not JSON data and has no such domain gives the error `#VALUE!`.
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain encodes no value
export function serialize(e: Expr, domains: readonly AnyDomain[] = []): Result<string> {
  const failure: { message: string }[] = [];
  const replacer = function (this: unknown, k: string, value: unknown): unknown {
    // JSON.stringify gives each replacer call an object as this.
    const holder = this as Record<string, unknown>;
    if (k !== "value" || holder["tag"] !== "lit") return value;
    // JSON.stringify applies toJSON before the replacer. The holder has the value before toJSON (V-044).
    const original = holder[k];
    if (isPlainJson(original)) return value;
    const d = domains.find((dom) => dom.encode !== undefined && dom.is(original));
    if (d?.encode !== undefined) {
      const encoded: EncodedValue = { $vex: "domain", domain: d.name, value: d.encode(original) };
      return encoded;
    }
    failure.push({ message: `a literal value is not JSON data and no domain encodes it` });
    return null;
  };
  let text: string;
  try {
    text = JSON.stringify(e, replacer);
  } catch (thrown) {
    return fail(vexError("threw", "the expression has no JSON form", { thrown }));
  }
  const first = failure[0];
  return first === undefined ? ok(text) : fail(vexError("bad-expression", first.message));
}

const isEncoded = (u: unknown): u is EncodedValue =>
  (u as { $vex?: unknown } | null)?.$vex === "domain" && typeof (u as { domain?: unknown }).domain === "string";

/** This function reads an expression from JSON text. It checks the whole tree. */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain decodes no value
export function parse(text: string, domains: readonly AnyDomain[] = []): Result<Expr> {
  let raw: unknown;
  const failure: string[] = [];
  try {
    raw = JSON.parse(text, (_k, value: unknown) => {
      if (!isEncoded(value)) return value;
      const d = domains.find((dom) => dom.name === value.domain);
      if (d?.decode === undefined) {
        failure.push(`no domain "${value.domain}" decodes a literal`);
        return value;
      }
      const decoded: unknown = d.decode(value.value);
      return decoded;
    });
  } catch (thrown) {
    return fail(vexError("bad-expression", "the text is not JSON", { thrown }));
  }
  const first = failure[0];
  if (first !== undefined) return fail(vexError("bad-expression", first));
  return isExpr(raw) ? ok(raw) : fail(vexError("bad-expression", "the JSON is not a valid Vex expression"));
}
