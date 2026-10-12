import { vex } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbChain, arbSpace, chainText, runChain as runOnBuilder, type DynRoot, type ModelOptions } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseChain, runChain } from "./chain-parser.ts";

const DOMAINS = [Vec2Domain, NumDomain, BoolDomain] as const;
const vec = fc.tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 })).map(([x, y]) => new Vec2(x, y));

/** The Lab reads a part of the builder: no free functions (call) and no with, because a program cannot read the names of with. */
const options = (keys: readonly string[]): ModelOptions => ({
  keys,
  paths: ["p", "q", "n", "s", "b", "nested.x", "missing", ""],
  ops: ["add", "subtract", "scale", "length", "dot", "distance", "halve", "maxComponent", "anyNonPositive", "multiply", "gt", "abs", "not", "nope"],
  fns: [],
  reduceOps: ["add", "max"],
  reductions: ["count", "sum", "mean", "min", "max", "any", "all", "none", "values", "keys", "errors", "first", "reduce"],
  depth: 2,
  binds: false,
});

describe("the Lab reader against the builder (QUALITY-PLAN §4.2)", () => {
  it("the text of a random chain gives the same program in the Lab reader as in the builder", () => {
    fc.assert(
      fc.property(arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbChain(options(s.keys)))), ([s, chain]) => {
        const root = vex(...DOMAINS).over(s);
        const text = chainText(chain);
        const read = runChain(parseChain(text), { root }) as { readonly program?: unknown };
        // The text is in both objects, so a failure shows it.
        expect({ text, program: read.program }).toEqual({ text, program: runOnBuilder(chain, root as unknown as DynRoot).program });
      }),
    );
  });
});
