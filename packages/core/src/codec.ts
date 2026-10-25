/**
 * The JSON form of the values of a literal. `serialize`, `parse`, `toDocument` and `fromDocument` share it. The package
 * index does not export this module.
 */
import type { AnyDomain } from "./domain.ts";
import { vexError } from "./errors.ts";
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
 * that looks like an expression stays data. The data of an extension is plain JSON, as before. A document has the same
 * form for the value of a literal (DOC.LITERAL).
 */
type Encoded =
  | { readonly $vex: "domain"; readonly domain: string; readonly value: unknown }
  | { readonly $vex: "number"; readonly value: "-0" | "NaN" | "Infinity" | "-Infinity" }
  | { readonly $vex: "escape"; readonly value: Readonly<Record<string, unknown>> };

/** This function tells if a value is a record: an object that is not an array. */
export const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null && !Array.isArray(u);

const isPlainRecord = (u: unknown): u is Readonly<Record<string, unknown>> => {
  if (!isRecord(u)) return false;
  const proto: unknown = Object.getPrototypeOf(u);
  return proto === Object.prototype || proto === null;
};

/** This function gives the JSON form of a value, or the reason why the value has no JSON form. */
export function encodeValue(u: unknown, domains: readonly AnyDomain[]): Result<unknown> {
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
    const entries: [string, unknown][] = [];
    for (const [k, x] of Object.entries(u)) {
      const r = encodeValue(x, domains);
      if (!r.ok) return r;
      entries.push([k, r.value]);
    }
    // Object.fromEntries gives an own field for each key, also for "__proto__" (V-062).
    const out = Object.fromEntries(entries);
    return ok(Object.hasOwn(u, "$vex") ? ({ $vex: "escape", value: out } satisfies Encoded) : out);
  }
  // A plain array or record stays data. Another object is a value of a domain, or it has no JSON form.
  const d = domains.find((dom) => dom.encode !== undefined && dom.is(u));
  if (d?.encode !== undefined) return ok({ $vex: "domain", domain: d.name, value: d.encode(u) } satisfies Encoded);
  return fail(vexError("bad-expression", "a literal value is not JSON data and no domain encodes it"));
}

const NUMBERS: Readonly<Record<string, number>> = { "-0": -0, NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, "-Infinity": Number.NEGATIVE_INFINITY };

/** This function reads a value from its JSON form. */
export function decodeValue(u: unknown, domains: readonly AnyDomain[]): Result<unknown> {
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
    const entries: [string, unknown][] = [];
    for (const [k, x] of Object.entries(record)) {
      const r = decodeValue(x, domains);
      if (!r.ok) return r;
      entries.push([k, r.value]);
    }
    // A key "__proto__" of the data is an own field too (V-062).
    return ok(Object.fromEntries(entries));
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
