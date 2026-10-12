import { defineDomain, type Domain, type OpTable } from "@mark1russell7/vex";
import { Vec2 } from "./vec2.ts";

/** An immutable angle in radians. */
export class Angle {
  readonly radians: number;

  constructor(radians: number) {
    this.radians = radians;
  }

  /** This function makes an angle from degrees. */
  static fromDegrees(deg: number): Angle {
    return new Angle((deg * Math.PI) / 180);
  }
  /** The zero angle: the identity of `add`. */
  static readonly zero: Angle = new Angle(0);

  add(o: Angle): Angle {
    return new Angle(this.radians + o.radians);
  }
  subtract(o: Angle): Angle {
    return new Angle(this.radians - o.radians);
  }
  scale(k: number): Angle {
    return new Angle(this.radians * k);
  }
  /** The same angle in the range from -π (included) to π (not included). */
  normalize(): Angle {
    const twoPi = Math.PI * 2;
    // Stryker disable next-line ArithmeticOperator: x + π and x - π differ by 2π, so the result after mod 2π is the same
    return new Angle((((this.radians + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI);
  }
  /** The vector with this angle and the length `length`. The result is a `Vec2`, so a chain continues in that domain. */
  toVec2(length = 1): Vec2 {
    return new Vec2(Math.cos(this.radians) * length, Math.sin(this.radians) * length);
  }
  sin(): number {
    return Math.sin(this.radians);
  }
  cos(): number {
    return Math.cos(this.radians);
  }
  degrees(): number {
    return (this.radians * 180) / Math.PI;
  }
  toString(): string {
    return `${this.radians} rad`;
  }
}

/** The ops of `AngleDomain`. */
export type AngleOps = OpTable<Angle, "add" | "subtract" | "scale" | "normalize" | "toVec2" | "sin" | "cos" | "degrees", "add" | "subtract">;

/** The domain of angles. A number argument of `add` or `subtract` lifts to an angle in radians. */
export const AngleDomain: Domain<"Angle", Angle, AngleOps> = defineDomain<"Angle", Angle, AngleOps>({
  name: "Angle",
  is: (u: unknown): u is Angle => u instanceof Angle,
  fromScalar: (n: number): Angle => new Angle(n),
  valid: (a: Angle): boolean => Number.isFinite(a.radians),
  show: (a: Angle): string => a.toString(),
  encode: (a: Angle): number => a.radians,
  decode: (u: unknown): Angle => new Angle(typeof u === "number" ? u : Number.NaN),
  ops: {
    add: { laws: ["commutative", "associative"], identity: (): Angle => Angle.zero, liftScalar: true, params: ["domain"] },
    subtract: { liftScalar: true, params: ["domain"] },
    scale: { params: ["number"] },
    normalize: {},
    toVec2: { params: ["number"] },
    sin: {},
    cos: {},
    degrees: {},
  },
});
