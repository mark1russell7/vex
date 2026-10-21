/**
 * The tools of the MCP server of Vex, as plain functions. A program, the records of a space and the variables are JSON
 * data. A value of a domain in that data has the JSON form of a literal of the IR, for example
 * `{ "$vex": "domain", "domain": "Vec2", "value": [1, 2] }`. A result has the same form.
 */
import { deps, domainOf, evaluate, explain, formatTrace, isDocument, isVexList, lit, nestingOf, parse, serialize, shapeError, sizeOf, space, type AnyDomain, type Expr, type Result, type Space, type VexError } from "@mark1russell7/vex";
import { emitModule, generate, type Schema } from "@mark1russell7/vex-compiler";
import { AngleDomain, BoolDomain, ColorDomain, DateDomain, LiftedNDVectorDomain, NDVectorDomain, NumDomain, NumRecordDomain, TextDomain, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";

/** The error of a tool for an input that is not valid. The server gives its message to the caller. */
export class ToolError extends Error {}

/** The domains that a tool uses without the input `domains`, in this order. */
export const DEFAULT_DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, Vec2Domain, XYDomain, ColorDomain, AngleDomain, DateDomain, NDVectorDomain, NumRecordDomain];

const KNOWN: readonly (readonly [string, AnyDomain])[] = [
  ["NumDomain", NumDomain],
  ["BoolDomain", BoolDomain],
  ["TextDomain", TextDomain],
  ["Vec2Domain", Vec2Domain],
  ["XYDomain", XYDomain],
  ["ColorDomain", ColorDomain],
  ["AngleDomain", AngleDomain],
  ["DateDomain", DateDomain],
  ["NDVectorDomain", NDVectorDomain],
  ["LiftedNDVectorDomain", LiftedNDVectorDomain],
  ["NumRecordDomain", NumRecordDomain],
];

/** This function gives the domains of a list of names: the import name, for example `Vec2Domain`, or the domain name `Vec2`. */
export function domainsOf(names: readonly string[] | undefined): readonly AnyDomain[] {
  if (names === undefined) return DEFAULT_DOMAINS;
  return names.map((n) => {
    const d = KNOWN.find(([importName, x]) => importName === n || x.name === n)?.[1];
    if (d === undefined) throw new ToolError(`no domain has the name "${n}". The names are ${KNOWN.map(([x]) => x).join(", ")}`);
    return d;
  });
}

/**
 * This function gives the expression of a program as JSON data: the tagged IR or a document (DOC.ENTRY). It checks the
 * program as `parse` does.
 */
export function programOf(program: unknown, domains: readonly AnyDomain[]): Expr {
  const r = parse(typeof program === "string" ? program : JSON.stringify(program), domains);
  if (r.ok) return r.value;
  // The error of a document has its location, so only a program in the tagged IR gets the reason of shapeError.
  const data = typeof program === "string" ? safeJson(program) : program;
  // A reason of the kernel ends with a period already.
  const reason = r.error.message.endsWith(".") ? r.error.message : `${r.error.message}.`;
  throw new ToolError(`the program is not valid: ${reason} ${isDocument(data) ? "" : (shapeError(data) ?? "")}`.trim());
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** This function gives the value of JSON data, with the values of the domains in it. */
export function dataOf(data: unknown, domains: readonly AnyDomain[]): unknown {
  const r = parse(JSON.stringify({ tag: "lit", value: data }), domains);
  if (!r.ok || r.value.tag !== "lit") throw new ToolError(`the data is not valid: ${r.ok ? "not a literal" : r.error.message}`);
  return r.value.value;
}

/** This function gives the JSON form of a value: the JSON form of a literal, or the text of the value. */
export function jsonOf(value: unknown, domains: readonly AnyDomain[]): unknown {
  if (isVexList(value)) return { list: value.items.map((it) => ({ key: it.key, ...resultJson(it.result, domains) })) };
  const r = serialize(lit(value), domains);
  if (r.ok) return (JSON.parse(r.value) as { readonly value: unknown }).value;
  const d = domainOf(domains, value);
  return { text: d?.show === undefined ? String(value) : d.show(value) };
}

/** The JSON form of an error of Vex: its code, its kind, its message and the path of its node. */
const errorJson = (e: VexError): unknown => ({ code: e.code, kind: e.kind, message: e.message, path: e.path });

/** This function gives the JSON form of a result. */
export function resultJson(r: Result<unknown>, domains: readonly AnyDomain[]): { readonly ok: boolean; readonly value?: unknown; readonly error?: unknown } {
  return r.ok ? { ok: true, value: jsonOf(r.value, domains) } : { ok: false, error: errorJson(r.error) };
}

/** The records of a space, as JSON data. */
export interface SpaceInput {
  readonly kind: "array" | "record" | "grid" | "tree" | "graph";
  readonly records: unknown;
  readonly parents?: Readonly<Record<string, string | null>> | undefined;
  readonly edges?: Readonly<Record<string, readonly string[]>> | undefined;
}

/** This function gives the space of the input. */
export function spaceOf(input: SpaceInput, domains: readonly AnyDomain[]): Space {
  const records = dataOf(input.records, domains);
  const record = (): Readonly<Record<string, unknown>> => {
    if (typeof records !== "object" || records === null || Array.isArray(records)) throw new ToolError(`a space of the kind ${input.kind} needs an object of records by key`);
    return records as Readonly<Record<string, unknown>>;
  };
  switch (input.kind) {
    case "array":
      if (!Array.isArray(records)) throw new ToolError("a space of the kind array needs a list of records");
      return space.array(records);
    case "grid":
      if (!Array.isArray(records) || !records.every(Array.isArray)) throw new ToolError("a space of the kind grid needs a list of rows of records");
      return space.grid(records as readonly (readonly unknown[])[]);
    case "record":
      return space.record(record());
    case "tree":
      return space.tree(record(), input.parents ?? {});
    case "graph":
      return space.graph(record(), input.edges ?? {});
  }
}

/** The input of a tool that evaluates a program. */
export interface RunInput {
  readonly program: unknown;
  readonly space: SpaceInput;
  readonly domains?: readonly string[] | undefined;
  readonly vars?: Readonly<Record<string, unknown>> | undefined;
}

/** This function gives the facts of a program: its reads, its size, and if the compiler gives it generated code. */
export function check(input: { readonly program: unknown; readonly domains?: readonly string[] | undefined }): unknown {
  const domains = domainsOf(input.domains);
  const e = programOf(input.program, domains);
  const g = generate(e, { domains });
  return {
    ok: true,
    nodes: sizeOf(e),
    nesting: nestingOf(e),
    reads: deps(e).map((d) => ({ path: d.path.join("."), at: d.at, axes: d.axes })),
    tier2: g.ok ? "the compiler gives generated code" : `tier 1 only: ${g.reason}`,
  };
}

/** This function evaluates a program at each origin, or at each key of the space. */
export function evaluateAll(input: RunInput & { readonly origins?: readonly string[] | undefined }): unknown {
  const domains = domainsOf(input.domains);
  const e = programOf(input.program, domains);
  const s = spaceOf(input.space, domains);
  const vars = input.vars === undefined ? {} : (dataOf(input.vars, domains) as Readonly<Record<string, unknown>>);
  return (input.origins ?? s.keys).map((origin) => ({ key: origin, ...resultJson(evaluate(e, { space: s, origin, domains, vars }), domains) }));
}

/** This function gives the trace of a program at one origin: each node, with its focus, its reads and its result. */
export function explainAt(input: RunInput & { readonly origin: string }): string {
  const domains = domainsOf(input.domains);
  const e = programOf(input.program, domains);
  const s = spaceOf(input.space, domains);
  const vars = input.vars === undefined ? {} : (dataOf(input.vars, domains) as Readonly<Record<string, unknown>>);
  return formatTrace(explain(e, { space: s, origin: input.origin, domains, vars }), domains);
}

/** This function gives the source of a standalone ES module of a program, or the reason that it has none. */
export function moduleOf(input: { readonly program: unknown; readonly domains?: readonly string[] | undefined; readonly schema: Schema; readonly name?: string | undefined }): unknown {
  const domains = domainsOf(input.domains);
  const e = programOf(input.program, domains);
  const m = emitModule(e, { domains, schema: input.schema, ...(input.name === undefined ? {} : { name: input.name }) });
  return m.ok ? { ok: true, source: m.source } : { ok: false, reason: m.reason };
}
