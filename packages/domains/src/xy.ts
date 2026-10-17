import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";

/**
 * A 2D vector as plain data. `XYDomain` has the component-wise ops of `Vec2Domain`, but each op is a function of plain
 * data. Thus a standalone module of `@mark1russell7/vex-compiler` can copy the domain, and a 2D program can be a module.
 */
export interface XY {
  readonly x: number;
  readonly y: number;
}

type XYFn2 = (a: XY, b: XY) => XY;
type XYFn1 = (a: XY) => XY;
type XYNum1 = (a: XY) => number;

/** The ops of `XYDomain`. */
export type XYOps = {
  readonly x: FnOp<XY, XYNum1>;
  readonly y: FnOp<XY, XYNum1>;
  readonly add: FnOp<XY, XYFn2>;
  readonly subtract: FnOp<XY, XYFn2>;
  readonly multiply: FnOp<XY, XYFn2>;
  readonly divide: FnOp<XY, XYFn2>;
  readonly min: FnOp<XY, XYFn2>;
  readonly max: FnOp<XY, XYFn2>;
  readonly scale: FnOp<XY, (a: XY, k: number) => XY>;
  readonly negate: FnOp<XY, XYFn1>;
  readonly abs: FnOp<XY, XYFn1>;
  readonly floor: FnOp<XY, XYFn1>;
  readonly ceil: FnOp<XY, XYFn1>;
  readonly round: FnOp<XY, XYFn1>;
  readonly dot: FnOp<XY, (a: XY, b: XY) => number>;
  readonly length: FnOp<XY, XYNum1>;
  readonly distance: FnOp<XY, (a: XY, b: XY) => number>;
  readonly area: FnOp<XY, XYNum1>;
  readonly sum: FnOp<XY, XYNum1>;
  readonly equals: FnOp<XY, (a: XY, b: XY) => boolean>;
};

/**
 * The domain of 2D vectors as plain data: an object with the two number fields `x` and `y` and no other field. The op
 * `xy` of `NumDomain` makes one. No op lifts a number, so each op has a static site in a module. Put `XYDomain` before
 * `NumRecordDomain`, because a record of numbers accepts the same objects.
 */
export const XYDomain: Domain<"XY", XY, XYOps> = defineDomain<"XY", XY, XYOps>({
  name: "XY",
  // A plain object: its prototype is Object.prototype or null, so an instance of a class such as Vec2 is not an XY.
  is: (u: unknown): u is XY => typeof u === "object" && u !== null && [Object.prototype, null].includes(Object.getPrototypeOf(u) as object | null) && Object.keys(u).length === 2 && typeof (u as XY).x === "number" && typeof (u as XY).y === "number",
  valid: (v: XY): boolean => Number.isFinite(v.x) && Number.isFinite(v.y),
  show: (v: XY): string => `(${v.x}, ${v.y})`,
  samples: (): readonly XY[] => [{ x: 0, y: 0 }, { x: 1.5, y: -2 }, { x: 3, y: 4 }],
  ops: {
    x: { fn: (a: XY): number => a.x, params: [], returns: "number" },
    y: { fn: (a: XY): number => a.y, params: [], returns: "number" },
    add: { fn: (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y }), laws: ["commutative", "associative"], identity: (): XY => ({ x: 0, y: 0 }), params: ["domain"], returns: "domain" },
    subtract: { fn: (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y }), params: ["domain"], returns: "domain" },
    multiply: { fn: (a: XY, b: XY): XY => ({ x: a.x * b.x, y: a.y * b.y }), laws: ["commutative", "associative"], identity: (): XY => ({ x: 1, y: 1 }), params: ["domain"], returns: "domain" },
    divide: { fn: (a: XY, b: XY): XY => ({ x: a.x / b.x, y: a.y / b.y }), params: ["domain"], returns: "domain" },
    min: { fn: (a: XY, b: XY): XY => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }), laws: ["commutative", "associative", "idempotent"], params: ["domain"], returns: "domain" },
    max: { fn: (a: XY, b: XY): XY => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }), laws: ["commutative", "associative", "idempotent"], params: ["domain"], returns: "domain" },
    scale: { fn: (a: XY, k: number): XY => ({ x: a.x * k, y: a.y * k }), params: ["number"], returns: "domain" },
    negate: { fn: (a: XY): XY => ({ x: -a.x, y: -a.y }), params: [], returns: "domain" },
    abs: { fn: (a: XY): XY => ({ x: Math.abs(a.x), y: Math.abs(a.y) }), params: [], returns: "domain" },
    floor: { fn: (a: XY): XY => ({ x: Math.floor(a.x), y: Math.floor(a.y) }), params: [], returns: "domain" },
    ceil: { fn: (a: XY): XY => ({ x: Math.ceil(a.x), y: Math.ceil(a.y) }), params: [], returns: "domain" },
    round: { fn: (a: XY): XY => ({ x: Math.round(a.x), y: Math.round(a.y) }), params: [], returns: "domain" },
    dot: { fn: (a: XY, b: XY): number => a.x * b.x + a.y * b.y, laws: ["commutative"], params: ["domain"], returns: "number" },
    length: { fn: (a: XY): number => Math.hypot(a.x, a.y), params: [], returns: "number" },
    distance: { fn: (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y), laws: ["commutative"], params: ["domain"], returns: "number" },
    area: { fn: (a: XY): number => a.x * a.y, params: [], returns: "number" },
    sum: { fn: (a: XY): number => a.x + a.y, params: [], returns: "number" },
    equals: { fn: (a: XY, b: XY): boolean => a.x === b.x && a.y === b.y, laws: ["commutative"], params: ["domain"], returns: "boolean" },
  },
});
