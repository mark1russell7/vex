/**
 * The gate of the names over the modules of a build and the programs of the corpus. A module has no read of a name
 * without a declaration. A module of a test of this package goes through the same gate in the setup of the tests. The
 * gate misses a read before a declaration through a closure, a TypeError, a RangeError and a wrong value with no exception.
 */
import { app, defineDomain, ref, type AnyDomain } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { emitModule } from "@mark1russell7/vex-compiler/module";
import { NumDomain } from "@mark1russell7/vex-domains";
import { domainsOf, programOf } from "@mark1russell7/vex-mcp";
import { describe, expect, it } from "vitest";
import { nameFaults } from "../../compiler/test/names.ts";
import { readCorpora, type CorpusProgram } from "./corpus.ts";
import { IREKO_COMMITTED, IREKO_NOT_COMMITTED, irekoSource, type Faults } from "./ireko-modules.ts";

const MODULES = [...IREKO_COMMITTED, ...IREKO_NOT_COMMITTED];

/** This function gives the kinds of the scalar fields of a record of the corpus. */
function kindsOf(record: unknown): NonNullable<Schema["fields"]> {
  const entries = typeof record === "object" && record !== null ? Object.entries(record) : [];
  return Object.fromEntries(entries.flatMap(([k, x]) => (typeof x === "number" ? [[k, "number"]] : typeof x === "string" ? [[k, "string"]] : typeof x === "boolean" ? [[k, "boolean"]] : [])));
}

/** This function gives the schema of a program of the corpus from its first record and its variables. */
function schemaOf(c: CorpusProgram): Schema {
  return { fields: kindsOf(c.space?.records?.[0]), vars: kindsOf(c.vars) };
}

/** This function gives a domain with an op that reads a name outside itself. No sample of the check of a copy reaches the read. */
function leaky(): AnyDomain {
  const outside = { k: 1 };
  // oxlint-disable-next-line typescript/no-implied-eval -- the test makes an op that reads a name outside itself.
  const read = new Function("outside", "return (a) => (a === 999 ? outside.k : a);") as (o: unknown) => (a: number) => number;
  return defineDomain({ name: "Leaky", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { peek: { fn: read(outside), params: ["number"], returns: "number" } } }) as AnyDomain;
}
describe("V-081 COMPILE.MODULE: the names of the printed modules", () => {
  it("V-081: the setup of the tests puts each module of this package through the gate", () => {
    expect(() => emitModule(app("peek", ref("n")), { domains: [NumDomain, leaky()], schema: { fields: { n: "number" } } })).toThrow(/a printed module has a fault of a name:\n.*outside/);
  });

  it.each<Faults>(["value", "throw"])("V-081: each module of ireko with the faults %s has a declaration for each name", (faults) => {
    expect(MODULES.flatMap((which) => nameFaults(irekoSource(which, faults)).map((x) => `${which}: ${x}`))).toStrictEqual([]);
  });

  it("V-081: each module of the corpus has a declaration for each name", () => {
    const printed = readCorpora().flatMap((corpus) =>
      corpus.programs.flatMap((c) => {
        const domains = domainsOf(c.domains);
        const m = emitModule(programOf(c.program, domains), { domains, schema: schemaOf(c), ...(c.space?.kind === undefined ? {} : { space: c.space.kind }) });
        return m.ok ? [nameFaults(m.source).map((x) => `${c.name}: ${x}`)] : [];
      }),
    );
    expect(printed.length).toBeGreaterThan(0);
    expect(printed.flat()).toStrictEqual([]);
  });
});
