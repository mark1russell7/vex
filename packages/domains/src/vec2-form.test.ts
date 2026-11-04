/**
 * The form of `Vec2Domain` in a standalone module (COMPILE.MODULE.FORM). Each function of the form must give the bits of
 * the method with its name. A new op of the domain without a form fails the first test.
 */
import { resolveOp, type AnyDomain } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { NumDomain } from "./scalars.ts";
import { Vec2, Vec2Domain } from "./vec2.ts";

type Fn = (...args: unknown[]) => unknown;

const form = Vec2Domain.moduleForm as NonNullable<typeof Vec2Domain.moduleForm>;
const formOps = form.ops as NonNullable<typeof form.ops>;
const domain: AnyDomain = Vec2Domain;

const COMPONENTS = [-2, -0, 0, 1, 3, Number.MIN_VALUE, 1e300];
const VECTORS = COMPONENTS.flatMap((x) => COMPONENTS.map((y) => new Vec2(x, y)));
/** Fewer vectors for an op with two vectors after its receiver. */
const FEW = [-2, -0, 0, 1].flatMap((x) => [-2, 0, 1].map((y) => new Vec2(x, y)));
const NUMBERS = [-2, -0.5, 0, 0.5, 1, 3];

/** This function gives the plain data of a value of the interpreter. */
const plainOf = (x: unknown): unknown => (x instanceof Vec2 ? x.toJSON() : x);

/** This function gives a text with the bits of a result: -0 is not 0. */
const textOf = (x: unknown): string => {
  const v = plainOf(x);
  return typeof v === "object" && v !== null ? `${textOf((v as { x: unknown }).x)},${textOf((v as { y: unknown }).y)}` : Object.is(v, -0) ? "-0" : String(v);
};

/** This function gives each list of arguments of the parameters of an op. */
function argLists(params: readonly string[]): readonly (readonly unknown[])[] {
  const vectors = params.filter((x) => x === "domain").length > 1 ? FEW : VECTORS;
  return params.reduce<readonly (readonly unknown[])[]>((acc, param) => acc.flatMap((xs) => (param === "domain" ? vectors : NUMBERS).map((x) => [...xs, x])), [[]]);
}

describe("the form of Vec2Domain in a module (COMPILE.MODULE.FORM)", () => {
  it("COMPILE.MODULE.FORM: each method op of the domain has a function of the form", () => {
    const methods = Object.entries(Vec2Domain.ops).flatMap(([name, spec]) => ("fn" in spec ? [] : [name]));
    expect(Object.keys(formOps).toSorted()).toStrictEqual(methods.toSorted());
    expect(methods).toHaveLength(43);
  });

  for (const name of Object.keys(formOps)) {
    it(`COMPILE.MODULE.FORM: ${name} of the form gives the bits of the method`, () => {
      const spec = Vec2Domain.ops[name as keyof typeof Vec2Domain.ops];
      const fn = formOps[name]?.fn as unknown as Fn;
      const receivers = (spec.params ?? []).filter((x) => x === "domain").length > 1 ? FEW : VECTORS;
      const wrong = receivers.flatMap((self) =>
        argLists(spec.params ?? []).flatMap((args) => {
          const method = resolveOp(domain, self, name)?.call(args);
          const copy = fn(plainOf(self), ...args.map(plainOf));
          const plain = copy === null || typeof copy !== "object" || Object.getPrototypeOf(copy) === Object.prototype;
          return textOf(method) === textOf(copy) && plain ? [] : [`${self.toString()} ${args.join(" ")}: ${textOf(method)} and ${textOf(copy)}`];
        }),
      );
      expect(wrong.slice(0, 5)).toStrictEqual([]);
    });
  }

  it("COMPILE.MODULE.FORM: the identities are the identities of the domain, as plain data", () => {
    expect(formOps["add"]?.identity?.()).toStrictEqual(Vec2Domain.ops.add.identity?.().toJSON());
    expect(formOps["multiply"]?.identity?.()).toStrictEqual(Vec2Domain.ops.multiply.identity?.().toJSON());
    expect(Object.entries(formOps).flatMap(([name, x]) => (x.identity === undefined ? [] : [name]))).toStrictEqual(["add", "multiply"]);
  });

  it("COMPILE.MODULE.FORM: the lift, the samples and the literal are plain data", () => {
    expect(form.fromScalar?.(2)).toStrictEqual({ x: 2, y: 2 });
    expect(form.samples?.()).toStrictEqual([{ x: 0, y: 0 }, { x: 1.5, y: -2 }, { x: 3, y: 4 }]);
    expect(form.literal?.(new Vec2(1, -0))).toStrictEqual({ x: 1, y: -0 });
    expect(form.literal?.({ x: 1, y: 2 })).toBeUndefined();
    expect(form.literal?.(1)).toBeUndefined();
  });

  it("COMPILE.MODULE.FORM: the test accepts a `Vec2` and plain data with two number fields, and no other value", () => {
    const is = form.is as (u: unknown) => boolean;
    expect([new Vec2(1, 2), { x: 1, y: 2 }, { x: Number.NaN, y: 0 }].map(is)).toStrictEqual([true, true, true]);
    expect([null, undefined, 1, "x", true, {}, [], { x: 1 }, { y: 1 }, { x: "1", y: 2 }, { x: 1, y: "2" }].map(is)).toStrictEqual(Array.from({ length: 11 }, () => false));
  });

  it("COMPILE.MODULE.FORM: `vec2` of NumDomain in a module gives plain data, of the kind of Vec2Domain", () => {
    const vec2 = NumDomain.moduleForm?.ops?.["vec2"];
    expect((vec2?.fn as unknown as Fn)(1, -0)).toStrictEqual({ x: 1, y: -0 });
    expect(vec2?.returns).toBe("domain:Vec2");
    expect(NumDomain.ops.vec2.fn(1, 2)).toBeInstanceOf(Vec2);
  });

  it("COMPILE.MODULE.FORM: the interpreter keeps its class: the ops stay methods, and `is` stays the test of the class", () => {
    expect(Vec2Domain.is(new Vec2(1, 2))).toBe(true);
    expect(Vec2Domain.is({ x: 1, y: 2 })).toBe(false);
    expect(resolveOp(domain, new Vec2(1, 2), "add")?.call([new Vec2(3, 4)])).toBeInstanceOf(Vec2);
    expect(Vec2Domain.ops.add.identity?.()).toBe(Vec2.zero);
  });
});
