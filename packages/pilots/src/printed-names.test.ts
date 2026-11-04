/**
 * The gate of the names over the modules of a build and the programs of the corpus: a module has no read of a name
 * without a declaration. A module of a test of this package goes through the same gate in the setup of the tests. The
 * gate misses a read before a declaration through a closure, a TypeError, a RangeError and a wrong value with no exception.
 */
import { emitModule } from "@mark1russell7/vex-compiler/module";
import { domainsOf, programOf } from "@mark1russell7/vex-mcp";
import { describe, expect, it } from "vitest";
import { nameFaults } from "../../compiler/src/test-names.ts";
import { readCorpora } from "./corpus.ts";
import { IREKO_COMMITTED, IREKO_NOT_COMMITTED, irekoSource, type Faults } from "./ireko-modules.ts";

const MODULES = [...IREKO_COMMITTED, ...IREKO_NOT_COMMITTED];

describe("V-081 COMPILE.MODULE: the names of the printed modules", () => {
  it.each<Faults>(["value", "throw"])("V-081: each module of ireko with the faults %s has a declaration for each name", (faults) => {
    expect(MODULES.flatMap((which) => nameFaults(irekoSource(which, faults)).map((x) => `${which}: ${x}`))).toStrictEqual([]);
  });

  it("V-081: each module of the corpus has a declaration for each name", () => {
    const printed = readCorpora().flatMap((corpus) =>
      corpus.programs.flatMap((c) => {
        const domains = domainsOf(c.domains);
        const m = emitModule(programOf(c.program, domains), { domains });
        return m.ok ? [nameFaults(m.source).map((x) => `${c.name}: ${x}`)] : [];
      }),
    );
    expect(printed.length).toBeGreaterThan(0);
    expect(printed.flat()).toStrictEqual([]);
  });
});
