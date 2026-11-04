import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";
import { Vec2 } from "./vec2.ts";
import type { XY } from "./xy.ts";

/**
 * The four sides of an inset, as plain data. The `start` sides are the leading pair, and the `end` sides are the
 * trailing pair. Each pair is in the order of a 2D vector: `x`, then `y`. The names are logical, so a side does not
 * depend on the direction of an axis.
 */
export interface Insets {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

type InsetsNum1 = (a: Insets) => number;
type InsetsXY1 = (a: Insets) => XY;
type InsetsVec1 = (a: Insets) => Vec2;

/** The ops of `InsetsDomain`. */
export type InsetsOps = {
  readonly startX: FnOp<Insets, InsetsNum1>;
  readonly startY: FnOp<Insets, InsetsNum1>;
  readonly endX: FnOp<Insets, InsetsNum1>;
  readonly endY: FnOp<Insets, InsetsNum1>;
  readonly start: FnOp<Insets, InsetsXY1>;
  readonly end: FnOp<Insets, InsetsXY1>;
  readonly startVec2: FnOp<Insets, InsetsVec1>;
  readonly endVec2: FnOp<Insets, InsetsVec1>;
  readonly add: FnOp<Insets, (a: Insets, b: Insets) => Insets> & { readonly liftScalar: true };
  readonly scale: FnOp<Insets, (a: Insets, k: number) => Insets>;
};

/**
 * The domain of insets: an object with the four number fields of `Insets` and no other field. The op `insets` of
 * `NumDomain` makes one, and a number argument of `add` lifts to four equal sides. `start` and `end` give plain `XY`
 * values, so a module can copy them. `startVec2` and `endVec2` give `Vec2` values, and a module cannot copy them. Put
 * `InsetsDomain` before `NumRecordDomain`, because a record of numbers accepts the same objects.
 */
export const InsetsDomain: Domain<"Insets", Insets, InsetsOps> = defineDomain<"Insets", Insets, InsetsOps>({
  name: "Insets",
  // LOOP.SIZE.OPS: each value has a fixed size, so each op has a size rule.
  size: "fixed",
  fields: ["startX", "startY", "endX", "endY"],
  // A plain object: its prototype is Object.prototype or null, so an instance of a class is not a value of this domain.
  is: (u: unknown): u is Insets => {
    if (typeof u !== "object" || u === null || ![Object.prototype, null].includes(Object.getPrototypeOf(u) as object | null) || Object.keys(u).length !== 4) return false;
    const v = u as Insets;
    return typeof v.startX === "number" && typeof v.startY === "number" && typeof v.endX === "number" && typeof v.endY === "number";
  },
  fromScalar: (n: number): Insets => ({ startX: n, startY: n, endX: n, endY: n }),
  valid: (v: Insets): boolean => Number.isFinite(v.startX) && Number.isFinite(v.startY) && Number.isFinite(v.endX) && Number.isFinite(v.endY),
  show: (v: Insets): string => `(${v.startX}, ${v.startY}, ${v.endX}, ${v.endY})`,
  samples: (): readonly Insets[] => [
    { startX: 0, startY: 0, endX: 0, endY: 0 },
    { startX: 1.5, startY: -2, endX: 3, endY: 4 },
    { startX: 8, startY: 8, endX: 8, endY: 8 },
  ],
  ops: {
    startX: { fn: (a: Insets): number => a.startX, params: [], returns: "number" },
    startY: { fn: (a: Insets): number => a.startY, params: [], returns: "number" },
    endX: { fn: (a: Insets): number => a.endX, params: [], returns: "number" },
    endY: { fn: (a: Insets): number => a.endY, params: [], returns: "number" },
    start: { fn: (a: Insets): XY => ({ x: a.startX, y: a.startY }), params: [], returns: "domain:XY" },
    end: { fn: (a: Insets): XY => ({ x: a.endX, y: a.endY }), params: [], returns: "domain:XY" },
    startVec2: { fn: (a: Insets): Vec2 => new Vec2(a.startX, a.startY), params: [], returns: "domain:Vec2" },
    endVec2: { fn: (a: Insets): Vec2 => new Vec2(a.endX, a.endY), params: [], returns: "domain:Vec2" },
    add: {
      fn: (a: Insets, b: Insets): Insets => ({ startX: a.startX + b.startX, startY: a.startY + b.startY, endX: a.endX + b.endX, endY: a.endY + b.endY }),
      laws: ["commutative", "associative"],
      identity: (): Insets => ({ startX: 0, startY: 0, endX: 0, endY: 0 }),
      liftScalar: true,
      params: ["domain"],
      returns: "domain",
    },
    scale: { fn: (a: Insets, k: number): Insets => ({ startX: a.startX * k, startY: a.startY * k, endX: a.endX * k, endY: a.endY * k }), params: ["number"], returns: "domain" },
  },
});
