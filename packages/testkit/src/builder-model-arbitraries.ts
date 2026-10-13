/**
 * The generator of the builder model test (docs/QUALITY-PLAN.md §4.1): random sequences of builder calls. The runner,
 * the model and the text of a chain are in `builder-model.ts`. The mutation lane does not mutate this file. A mutant of
 * a generator changes the distribution of the cases, not a behavior that a test can check.
 */
import * as fc from "fast-check";
import { VAR, type Arg, type AxisName, type BuilderChain, type ModelOptions, type MoveCall, type Reduction, type Step } from "./builder-model.ts";

const arbMoveCall = (o: ModelOptions): fc.Arbitrary<MoveCall> =>
  fc.oneof(
    fc.constantFrom(...o.keys, "Z").map((key): MoveCall => ({ t: "to", key })),
    fc.integer({ min: -1, max: 4 }).map((i): MoveCall => ({ t: "index", i })),
    fc.oneof(fc.tuple(fc.integer({ min: -1, max: 1 })), fc.tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))).map((d): MoveCall => ({ t: "offset", d })),
    fc.constantFrom<MoveCall>({ t: "other" }, { t: "origin" }, { t: "parent" }),
  );

// errors() takes no options, because a strict list op fails on the first error item.
const arbReduction = (o: ModelOptions): fc.Arbitrary<Reduction> =>
  fc
    .tuple(fc.constantFrom(...o.reductions), fc.constantFrom(...o.reduceOps), fc.boolean())
    .map(([op, w, strict]): Reduction => (op === "reduce" ? { op, with: w, strict } : { op, strict: op !== "errors" && strict }));

function arbArg(o: ModelOptions, depth: number, vars: boolean): fc.Arbitrary<Arg> {
  const leaves: fc.Arbitrary<Arg>[] = [
    fc.constantFrom(...o.paths).map((path): Arg => ({ k: "field", path })),
    fc.oneof(fc.integer({ min: -3, max: 3 }), fc.boolean()).map((value): Arg => ({ k: "lit", value })),
    fc.tuple(fc.constantFrom(...o.keys, "Z"), fc.constantFrom(...o.paths)).map(([key, path]): Arg => ({ k: "of", key, path })),
    fc.oneof(fc.integer({ min: -3, max: 3 }), fc.boolean(), fc.constantFrom(...o.paths)).map((value): Arg => ({ k: "rootLit", value })),
    fc.constantFrom(...o.paths).map((path): Arg => ({ k: "rootField", path })),
  ];
  if (vars) leaves.push(fc.constant<Arg>({ k: "var", name: VAR }));
  if (depth <= 0) return fc.oneof(...leaves);
  return fc.oneof(
    ...leaves,
    arbChain(o, depth - 1, vars).map((chain): Arg => ({ k: "chain", chain })),
    fc.tuple(arbArg(o, depth - 1, vars), arbArg(o, depth - 1, vars)).map(([a, b]): Arg => ({ k: "rec", a, b })),
  );
}

/** The calls of a chain. Only the last call can be an axis without a reduction, because a list chain has no other calls. */
function arbSteps(o: ModelOptions, depth: number, vars: boolean): fc.Arbitrary<readonly Step[]> {
  const args = fc.array(arbArg(o, depth, vars), { maxLength: 2 });
  const simple: fc.Arbitrary<Step>[] = [
    fc.constantFrom(...o.paths).map((path): Step => ({ t: "from", path })),
    arbMoveCall(o).map((m): Step => ({ t: "move", m })),
    fc.tuple(fc.constantFrom(...o.ops), args).map(([op, a]): Step => ({ t: "op", op, args: a })),
    arbArg(o, depth, vars).map((fallback): Step => ({ t: "ifError", fallback })),
  ];
  if (o.fns.length > 0) simple.push(fc.tuple(fc.constantFrom(...o.fns), args).map(([name, a]): Step => ({ t: "call", name, args: a })));
  const axisNames = fc.constantFrom<AxisName>("others", "each", "neighbors4", "neighbors8", "children", "ancestors", "descendants", "siblings", "window", "successors", "predecessors", "reachable");
  const nested: fc.Arbitrary<Step>[] =
    depth <= 0
      ? []
      : [
          fc.tuple(axisNames, arbSteps(o, depth - 1, vars), fc.option(arbSteps(o, depth - 1, vars), { nil: undefined }), arbReduction(o)).map(
            ([axis, body, where, reduce]): Step => (where === undefined ? { t: "axis", axis, body, reduce } : { t: "axis", axis, body, where, reduce }),
          ),
          fc.tuple(arbSteps(o, depth - 1, vars), arbSteps(o, depth - 1, vars)).map(([a, b]): Step => ({ t: "fork", a, b })),
          ...(o.binds === false ? [] : [fc.tuple(arbArg(o, depth - 1, vars), arbSteps(o, depth - 1, true)).map(([bind, body]): Step => ({ t: "with", bind, body }))]),
        ];
  const last: fc.Arbitrary<Step | undefined> =
    depth <= 0
      ? fc.constant(undefined)
      : fc.option(
          fc.tuple(axisNames, arbSteps(o, depth - 1, vars)).map(([axis, body]): Step => ({ t: "axis", axis, body })),
          { nil: undefined, freq: 4 },
        );
  return fc.tuple(fc.array(fc.oneof(...simple, ...nested), { maxLength: 4 }), last).map(([steps, end]) => (end === undefined ? steps : [...steps, end]));
}

/** A chain from the root. */
export function arbChain(o: ModelOptions, depth: number = o.depth, vars = false): fc.Arbitrary<BuilderChain> {
  const head = fc.oneof(
    fc.constantFrom(...o.paths).map((path): BuilderChain["head"] => ({ t: "from", path })),
    fc.oneof(fc.integer({ min: -3, max: 3 }), fc.boolean(), fc.constantFrom(...o.paths)).map((value): BuilderChain["head"] => ({ t: "start", value })),
  );
  return fc.tuple(head, arbSteps(o, depth, vars)).map(([h, steps]) => ({ head: h, steps }));
}
