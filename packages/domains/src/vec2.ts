import { defineDomain, type Domain, type FnOp, type OpTable } from "@mark1russell7/vex";

/**
 * An immutable 2D vector. The methods live on the prototype, so a vector costs two numbers. Division is real
 * division: a division by zero gives an infinite component, and the domain check turns it into `#NUM!`.
 */
export class Vec2 {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** This function makes a vector. */
  static of(x: number, y: number): Vec2 {
    return new Vec2(x, y);
  }
  /** This function makes a vector with the same value in both components. */
  static scalar(n: number): Vec2 {
    return new Vec2(n, n);
  }
  /** The zero vector. */
  static readonly zero: Vec2 = new Vec2(0, 0);
  /** The vector of ones. */
  static readonly one: Vec2 = new Vec2(1, 1);

  add(o: Vec2): Vec2 {
    return new Vec2(this.x + o.x, this.y + o.y);
  }
  subtract(o: Vec2): Vec2 {
    return new Vec2(this.x - o.x, this.y - o.y);
  }
  /** The component-wise product. */
  multiply(o: Vec2): Vec2 {
    return new Vec2(this.x * o.x, this.y * o.y);
  }
  /** The component-wise quotient. A zero component of `o` gives an infinite component. */
  divide(o: Vec2): Vec2 {
    return new Vec2(this.x / o.x, this.y / o.y);
  }
  /** The component-wise minimum. */
  min(o: Vec2): Vec2 {
    return new Vec2(Math.min(this.x, o.x), Math.min(this.y, o.y));
  }
  /** The component-wise maximum. */
  max(o: Vec2): Vec2 {
    return new Vec2(Math.max(this.x, o.x), Math.max(this.y, o.y));
  }
  scale(k: number): Vec2 {
    return new Vec2(this.x * k, this.y * k);
  }
  negate(): Vec2 {
    return new Vec2(-this.x, -this.y);
  }
  halve(): Vec2 {
    return this.scale(0.5);
  }
  abs(): Vec2 {
    return new Vec2(Math.abs(this.x), Math.abs(this.y));
  }
  round(): Vec2 {
    return new Vec2(Math.round(this.x), Math.round(this.y));
  }
  floor(): Vec2 {
    return new Vec2(Math.floor(this.x), Math.floor(this.y));
  }
  ceil(): Vec2 {
    return new Vec2(Math.ceil(this.x), Math.ceil(this.y));
  }
  clamp(lo: number, hi: number): Vec2 {
    return new Vec2(Math.min(hi, Math.max(lo, this.x)), Math.min(hi, Math.max(lo, this.y)));
  }
  swap(): Vec2 {
    return new Vec2(this.y, this.x);
  }
  /** The vector turned by `radians`, counterclockwise. */
  rotate(radians: number): Vec2 {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return new Vec2(c * this.x - s * this.y, s * this.x + c * this.y);
  }
  /** The vector with length 1. The zero vector stays zero. */
  normalize(): Vec2 {
    const len = this.length();
    return len === 0 ? this : this.scale(1 / len);
  }
  /** The linear interpolation from this vector to `o`. */
  lerp(o: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t);
  }
  length(): number {
    return Math.hypot(this.x, this.y);
  }
  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }
  distance(o: Vec2): number {
    return Math.hypot(this.x - o.x, this.y - o.y);
  }
  dot(o: Vec2): number {
    return this.x * o.x + this.y * o.y;
  }
  /** The z component of the 3D cross product. */
  cross(o: Vec2): number {
    return this.x * o.y - this.y * o.x;
  }
  /** The angle of the vector, in radians, from the x axis. */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }
  /** The product of the components: the area of a size vector. */
  area(): number {
    return this.x * this.y;
  }
  /** The sum of the components. */
  sum(): number {
    return this.x + this.y;
  }
  minComponent(): number {
    return Math.min(this.x, this.y);
  }
  maxComponent(): number {
    return Math.max(this.x, this.y);
  }
  equals(o: Vec2): boolean {
    return this.x === o.x && this.y === o.y;
  }
  anyNonPositive(): boolean {
    return this.x <= 0 || this.y <= 0;
  }
  allPositive(): boolean {
    return this.x > 0 && this.y > 0;
  }
  anyNegative(): boolean {
    return this.x < 0 || this.y < 0;
  }
  allNonNegative(): boolean {
    return this.x >= 0 && this.y >= 0;
  }
  anyZero(): boolean {
    return this.x === 0 || this.y === 0;
  }
  allZero(): boolean {
    return this.x === 0 && this.y === 0;
  }
  anyLessThan(n: number): boolean {
    return this.x < n || this.y < n;
  }
  allLessThan(n: number): boolean {
    return this.x < n && this.y < n;
  }
  anyGreaterThan(n: number): boolean {
    return this.x > n || this.y > n;
  }
  allGreaterThan(n: number): boolean {
    return this.x > n && this.y > n;
  }
  toJSON(): { readonly x: number; readonly y: number } {
    return { x: this.x, y: this.y };
  }
  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

type Vec2OpNames =
  | "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "scale" | "negate" | "halve" | "abs" | "round" | "floor"
  | "ceil" | "clamp" | "swap" | "rotate" | "normalize" | "lerp" | "length" | "lengthSq" | "distance" | "dot" | "cross"
  | "angle" | "area" | "sum" | "minComponent" | "maxComponent" | "equals" | "anyNonPositive" | "allPositive"
  | "anyNegative" | "allNonNegative" | "anyZero" | "allZero" | "anyLessThan" | "allLessThan" | "anyGreaterThan"
  | "allGreaterThan";

/** The ops of `Vec2Domain`. The ops `x` and `y` give a component. */
export type Vec2Ops = OpTable<Vec2, Vec2OpNames, "add" | "subtract" | "multiply" | "divide" | "min" | "max"> & {
  readonly x: FnOp<Vec2, (v: Vec2) => number>;
  readonly y: FnOp<Vec2, (v: Vec2) => number>;
};

/** The domain of 2D vectors. A number argument of a component-wise op lifts to a vector with that value twice. */
export const Vec2Domain: Domain<"Vec2", Vec2, Vec2Ops> = defineDomain<"Vec2", Vec2, Vec2Ops>({
  name: "Vec2",
  is: (u: unknown): u is Vec2 => u instanceof Vec2,
  fromScalar: (n: number): Vec2 => Vec2.scalar(n),
  valid: (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y),
  show: (v: Vec2): string => v.toString(),
  encode: (v: Vec2): readonly [number, number] => [v.x, v.y],
  decode: (u: unknown): Vec2 => {
    // Stryker disable next-line ArrayDeclaration: a list with a text gives NaN components, like the empty list
    const [x, y] = Array.isArray(u) ? (u as readonly unknown[]) : [];
    return new Vec2(typeof x === "number" ? x : Number.NaN, typeof y === "number" ? y : Number.NaN);
  },
  ops: {
    // The components are fields of a vector, not methods, so these two ops are functions.
    x: { fn: (v: Vec2): number => v.x, params: [], returns: "number" },
    y: { fn: (v: Vec2): number => v.y, params: [], returns: "number" },
    add: { laws: ["commutative", "associative"], identity: () => Vec2.zero, liftScalar: true, params: ["domain"], returns: "domain" },
    subtract: { liftScalar: true, params: ["domain"], returns: "domain" },
    multiply: { laws: ["commutative", "associative"], identity: () => Vec2.one, liftScalar: true, params: ["domain"], returns: "domain" },
    divide: { liftScalar: true, params: ["domain"], returns: "domain" },
    min: { laws: ["commutative", "associative", "idempotent"], liftScalar: true, params: ["domain"], returns: "domain" },
    max: { laws: ["commutative", "associative", "idempotent"], liftScalar: true, params: ["domain"], returns: "domain" },
    scale: { params: ["number"], returns: "domain" },
    negate: { params: [], returns: "domain" },
    halve: { params: [], returns: "domain" },
    abs: { params: [], returns: "domain" },
    round: { params: [], returns: "domain" },
    floor: { params: [], returns: "domain" },
    ceil: { params: [], returns: "domain" },
    clamp: { params: ["number", "number"], returns: "domain" },
    swap: { params: [], returns: "domain" },
    rotate: { params: ["number"], returns: "domain" },
    normalize: { params: [], returns: "domain" },
    lerp: { params: ["domain", "number"], returns: "domain" },
    length: { params: [], returns: "number" },
    lengthSq: { params: [], returns: "number" },
    distance: { params: ["domain"], returns: "number" },
    dot: { laws: ["commutative"], params: ["domain"], returns: "number" },
    cross: { params: ["domain"], returns: "number" },
    angle: { params: [], returns: "number" },
    area: { params: [], returns: "number" },
    sum: { params: [], returns: "number" },
    minComponent: { params: [], returns: "number" },
    maxComponent: { params: [], returns: "number" },
    equals: { laws: ["commutative"], params: ["domain"], returns: "boolean" },
    anyNonPositive: { params: [], returns: "boolean" },
    allPositive: { params: [], returns: "boolean" },
    anyNegative: { params: [], returns: "boolean" },
    allNonNegative: { params: [], returns: "boolean" },
    anyZero: { params: [], returns: "boolean" },
    allZero: { params: [], returns: "boolean" },
    anyLessThan: { params: ["number"], returns: "boolean" },
    allLessThan: { params: ["number"], returns: "boolean" },
    anyGreaterThan: { params: ["number"], returns: "boolean" },
    allGreaterThan: { params: ["number"], returns: "boolean" },
  },
});
