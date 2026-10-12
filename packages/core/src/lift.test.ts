import { describe, expect, expectTypeOf, it } from "vitest";
import { vex } from "./builder.ts";
import type { Optional } from "./result.ts";
import { space } from "./space.ts";
import { Pt, PtDomain } from "./test-support.ts";

const root = vex(PtDomain).over(space.record({ A: { position: new Pt(4, 6), weight: 2 }, B: { position: new Pt(0, 0), weight: 3 } }));

describe("a lifted number argument (TYPE.LIFT, CALL.LIFT)", () => {
  // V-NEXT-lift-chain: the types accepted a number literal for a lifted parameter, but not a number field, a number
  // argument or a chain of a number. The interpreter lifts each of them, so the types refused valid programs.
  it("TYPE.LIFT CALL.LIFT V-NEXT-lift-chain: a field, an argument and a chain of a number lift like a number literal", () => {
    const byLiteral = root.from("position")._.add(2);
    const byField = root.from("position")._.add("weight");
    const byArg = root.from("position")._.add(root.of("A", "weight"));
    const byChain = root.from("position")._.add(root.from("weight"));
    expectTypeOf(byChain.at("A")).toEqualTypeOf<Optional<Pt>>();
    expectTypeOf(byField.at("A")).toEqualTypeOf<Optional<Pt>>();
    for (const c of [byLiteral, byField, byArg, byChain]) expect(c.result("A")).toEqual({ ok: true, value: new Pt(6, 8) });
    expect(byChain.result("B")).toEqual({ ok: true, value: new Pt(3, 3) });
  });

  it("TYPE.LIFT: an op without liftScalar still refuses each form of a number", () => {
    // @ts-expect-error -- dot does not declare liftScalar
    root.from("position")._.dot(root.from("weight"));
    // @ts-expect-error -- dot does not declare liftScalar
    root.from("position")._.dot("weight");
    expect(true).toBe(true);
  });
});
