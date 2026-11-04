import { evaluate, sizeError, space, type Expr } from "@mark1russell7/vex";
import { emitModule, tiered } from "@mark1russell7/vex-compiler";
import { fromCore, fromReference, referenceEvaluate } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SEARCH_DOMAINS, SEARCH_EACH, SEARCH_ITEM, SEARCH_SCHEMA, searchRecords, searchReference, searchResult, type SearchResult } from "./list-search.ts";

type Graph = readonly (readonly number[])[];

const FORMS: readonly (readonly [string, Expr])[] = [["each", SEARCH_EACH], ["setNth", SEARCH_ITEM]];

/** This function gives the result of tier 1 at the first record. */
function inTier1(e: Expr, next: Graph): SearchResult {
  const r = evaluate(e, { space: space.array(searchRecords(next)), origin: "0", domains: SEARCH_DOMAINS });
  if (!r.ok) throw new Error(r.error.message);
  return searchResult(r.value);
}

/** This function gives the result of a standalone module at the first record. */
function inModule(e: Expr, next: Graph): SearchResult {
  const m = emitModule(e, { domains: SEARCH_DOMAINS, schema: SEARCH_SCHEMA, lists: "plain" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  const run = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn run;`)() as (rs: unknown, vars: unknown) => readonly unknown[];
  return searchResult(run(searchRecords(next), {})[0]);
}

/** The graphs of the search: one node for each item, and the edges go to nodes of the list. */
const graphs: fc.Arbitrary<Graph> = fc.integer({ min: 1, max: 7 }).chain((n) => fc.array(fc.array(fc.nat(n - 1), { maxLength: 3 }), { minLength: n, maxLength: n }));

describe("a search that keeps its state in lists (LIST.SETNTH, LOOP.LIST)", () => {
  it("LIST.SETNTH: a cycle of three nodes, the values checked by hand", () => {
    const want = { order: [2, 1, 0], back: 1 };
    expect(searchReference([[1], [2], [0]])).toEqual(want);
    for (const [, e] of FORMS) expect(inTier1(e, [[1], [2], [0]])).toEqual(want);
  });

  it("LIST.SETNTH: two parts and a diamond, the values checked by hand", () => {
    const want = { order: [3, 1, 2, 0, 4], back: 0 };
    const diamond = [[1, 2], [3], [3], [], []];
    expect(searchReference(diamond)).toEqual(want);
    for (const [, e] of FORMS) expect(inTier1(e, diamond)).toEqual(want);
  });

  it("LOOP.SIZE.SETNTH: LOOP.SIZE takes both forms of the step", () => {
    for (const [, e] of FORMS) expect(sizeError(e, { domains: SEARCH_DOMAINS })).toBeUndefined();
  });

  it("P17 LIST.SETNTH COMPILE.MODULE.SETNTH: both forms give the reference in tier 1, tier 2, the kernel and a module", () => {
    fc.assert(
      fc.property(graphs, (next) => {
        const want = searchReference(next);
        const s = space.array(searchRecords(next));
        for (const [, e] of FORMS) {
          const opts = { space: s, origin: "0", domains: SEARCH_DOMAINS };
          const one = evaluate(e, opts);
          expect(inTier1(e, next)).toEqual(want);
          expect(fromCore(tiered(e, { domains: SEARCH_DOMAINS }).run({ space: s, origin: "0" }))).toStrictEqual(fromCore(one));
          expect(fromReference(referenceEvaluate(e, opts))).toStrictEqual(fromCore(one));
          expect(inModule(e, next)).toEqual(want);
        }
      }),
    );
  });
});
