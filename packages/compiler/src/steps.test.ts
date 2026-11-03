/**
 * The steps in the tiers and the modules (STEP.MAX, STEP.VALUE). Each construct of Vex is of step A today, so this file
 * declares `iterate` as a construct of step B and `call` as a construct of step C, in a mock of the table of the core.
 * Tier 2, `emitModule` and `emitSheetModule` refuse the programs that the interpreter refuses, with the same reason.
 */
import { app, evaluate, iterate, lit, programStep, sizeError, space, v, type Expr, type Result, type VexStep } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbExpr, arbOrigin, arbSpace, fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { emitModule, emitSheetModule } from "./module.ts";
import { generate, tiered } from "./tiers.ts";

vi.mock("../../core/src/constructs.ts", async (load) => {
  const real = await load<{ readonly CONSTRUCT_STEPS: Readonly<Record<string, VexStep>> }>();
  return { ...real, CONSTRUCT_STEPS: { ...real.CONSTRUCT_STEPS, iterate: "B", call: "C" } };
});

const LOOP: Expr = iterate(3, { i: lit(0) }, { i: app("add", v("i"), lit(1)) }, v("i"));
const REASON = 'the program needs step B, and the host accepts the steps up to A: the node "iterate" at the root needs step B (STEP.MAX)';
const RECORDS = space.array([{ v: 1 }, { v: 2 }]);
const OPTIONS = { domains: [NumDomain], schema: { fields: { v: "number" } } } as const;

const vec = fc.tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 })).map(([x, y]) => new Vec2(x, y));
const OPS = ["add", "subtract", "scale", "length", "dot", "divide", "multiply", "anyNonPositive", "gt", "not", "and"];
const DOMAINS = [Vec2Domain, NumDomain, BoolDomain] as const;
const refused = (r: Result<unknown>): boolean => !r.ok && r.error.message.endsWith("(STEP.MAX)");

describe("the steps in the tiers and the modules", () => {
  it("STEP.MAX: tier 2, a module and a module of a sheet refuse a program above maxStep, with the reason of tier 1", () => {
    const options = { ...OPTIONS, maxStep: "A" } as const;
    expect(generate(LOOP, options)).toStrictEqual({ ok: false, reason: REASON });
    const run = tiered(LOOP, options).run({ space: RECORDS, origin: "0" });
    expect(run.ok ? run.value : run.error.message).toBe(REASON);
    expect(evaluate(LOOP, { space: RECORDS, origin: "0", domains: options.domains, maxStep: "A" })).toStrictEqual(run);
    expect(emitModule(LOOP, options)).toStrictEqual({ ok: false, reason: REASON });
    const sheet = emitSheetModule(new Map([["A", LOOP]]), { ...options, kinds: { A: "number" } });
    expect(sheet.ok ? "" : sheet.reason).toContain(REASON);
    // The default is B, so each tier accepts the program.
    expect(generate(LOOP, OPTIONS).ok).toBe(true);
    expect(emitModule(LOOP, OPTIONS).ok).toBe(true);
    expect(emitSheetModule(new Map([["A", LOOP]]), { ...OPTIONS, kinds: { A: "number" } }).ok).toBe(true);
  });

  it("STEP.MAX: a value of maxStep that is not a step is not valid in each tier", () => {
    const options = { ...OPTIONS, maxStep: "Z" as VexStep };
    const reason = 'the option maxStep "Z" is not a step of Vex. The steps are A, B, C (STEP.MAX)';
    expect(generate(lit(1), options)).toStrictEqual({ ok: false, reason });
    expect(emitModule(lit(1), options)).toStrictEqual({ ok: false, reason });
  });

  it("P17 STEP.VALUE: on programs of the whole grammar, each step that accepts a program gives the same value in each tier", () => {
    const runs = arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbExpr({ domainValue: vec, ops: OPS }), arbOrigin(s)));
    const seen = new Set<VexStep>();
    fc.assert(
      fc.property(runs, ([s, e, k]) => {
        const run = { space: s, origin: k };
        const at = (maxStep: VexStep): readonly [Result<unknown>, Result<unknown>] => [evaluate(e, { domains: DOMAINS, maxStep, ...run }), tiered(e, { domains: DOMAINS, maxStep }).run(run)];
        const [a1, a2] = at("A");
        const [b1, b2] = at("B");
        const [c1] = at("C");
        const step = programStep(e).step;
        seen.add(step);
        // A check before the check of steps, for example LOOP.SIZE, gives its error at each step.
        if (sizeError(e, { domains: DOMAINS }) === undefined) {
          // A refuses each program above A. B accepts a program that A refuses only if its step is B.
          expect([refused(a1), refused(a2)]).toEqual([step !== "A", step !== "A"]);
          expect([refused(b1), refused(b2)]).toEqual([step === "C", step === "C"]);
          expect(refused(c1)).toBe(false);
        }
        if (!refused(a1)) expect(fromCore(a1)).toStrictEqual(fromCore(b1));
        if (!refused(b1)) {
          expect(fromCore(b2)).toStrictEqual(fromCore(b1));
          expect(fromCore(c1)).toStrictEqual(fromCore(b1));
        }
      }),
    );
    expect(seen).toEqual(new Set(["A", "B", "C"]));
  });
});
