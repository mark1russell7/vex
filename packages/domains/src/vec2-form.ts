import type { ModuleForm } from "@mark1russell7/vex";

/** A 2D vector in a standalone module: plain data with the fields of `Vec2`. */
interface Plain {
  readonly x: number;
  readonly y: number;
}

/**
 * The form of `Vec2Domain` in a standalone module (COMPILE.MODULE.FORM). A module has no import, and a copy of the class
 * is another class. Thus a vector in a module is plain data, the data of `toJSON` of a `Vec2`. Each op has the arithmetic
 * of the method with its name, so it has the same bits. The test accepts a `Vec2` too, so a host can give its vectors.
 */
export const VEC2_FORM: ModuleForm = {
  is: (u: unknown): boolean => typeof u === "object" && u !== null && typeof (u as Plain).x === "number" && typeof (u as Plain).y === "number",
  fromScalar: (n: number): Plain => ({ x: n, y: n }),
  samples: (): readonly Plain[] => [{ x: 0, y: 0 }, { x: 1.5, y: -2 }, { x: 3, y: 4 }],
  ops: {
    add: { fn: (a: Plain, b: Plain): Plain => ({ x: a.x + b.x, y: a.y + b.y }), identity: (): Plain => ({ x: 0, y: 0 }) },
    subtract: { fn: (a: Plain, b: Plain): Plain => ({ x: a.x - b.x, y: a.y - b.y }) },
    multiply: { fn: (a: Plain, b: Plain): Plain => ({ x: a.x * b.x, y: a.y * b.y }), identity: (): Plain => ({ x: 1, y: 1 }) },
    divide: { fn: (a: Plain, b: Plain): Plain => ({ x: a.x / b.x, y: a.y / b.y }) },
    min: { fn: (a: Plain, b: Plain): Plain => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }) },
    max: { fn: (a: Plain, b: Plain): Plain => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }) },
    scale: { fn: (a: Plain, k: number): Plain => ({ x: a.x * k, y: a.y * k }) },
    negate: { fn: (a: Plain): Plain => ({ x: -a.x, y: -a.y }) },
    halve: { fn: (a: Plain): Plain => ({ x: a.x * 0.5, y: a.y * 0.5 }) },
    abs: { fn: (a: Plain): Plain => ({ x: Math.abs(a.x), y: Math.abs(a.y) }) },
    round: { fn: (a: Plain): Plain => ({ x: Math.round(a.x), y: Math.round(a.y) }) },
    floor: { fn: (a: Plain): Plain => ({ x: Math.floor(a.x), y: Math.floor(a.y) }) },
    ceil: { fn: (a: Plain): Plain => ({ x: Math.ceil(a.x), y: Math.ceil(a.y) }) },
    clamp: { fn: (a: Plain, lo: number, hi: number): Plain => ({ x: Math.min(hi, Math.max(lo, a.x)), y: Math.min(hi, Math.max(lo, a.y)) }) },
    swap: { fn: (a: Plain): Plain => ({ x: a.y, y: a.x }) },
    compose: { fn: (a: Plain, main: number, cross: number): Plain => ({ x: a.x * main + a.y * cross, y: a.y * main + a.x * cross }) },
    select: { fn: (m: Plain, a: Plain, b: Plain): Plain => ({ x: m.x !== 0 ? a.x : b.x, y: m.y !== 0 ? a.y : b.y }) },
    rotate: {
      fn: (a: Plain, radians: number): Plain => {
        const c = Math.cos(radians);
        const s = Math.sin(radians);
        return { x: c * a.x - s * a.y, y: s * a.x + c * a.y };
      },
    },
    normalize: {
      fn: (a: Plain): Plain => {
        const len = Math.hypot(a.x, a.y);
        return len === 0 ? { x: a.x, y: a.y } : { x: a.x * (1 / len), y: a.y * (1 / len) };
      },
    },
    lerp: { fn: (a: Plain, o: Plain, t: number): Plain => ({ x: a.x + (o.x - a.x) * t, y: a.y + (o.y - a.y) * t }) },
    length: { fn: (a: Plain): number => Math.hypot(a.x, a.y) },
    lengthSq: { fn: (a: Plain): number => a.x * a.x + a.y * a.y },
    distance: { fn: (a: Plain, o: Plain): number => Math.hypot(a.x - o.x, a.y - o.y) },
    dot: { fn: (a: Plain, o: Plain): number => a.x * o.x + a.y * o.y },
    along: { fn: (a: Plain, dir: Plain): number => a.x * dir.x + a.y * dir.y },
    across: { fn: (a: Plain, dir: Plain): number => a.x * dir.y + a.y * dir.x },
    cross: { fn: (a: Plain, o: Plain): number => a.x * o.y - a.y * o.x },
    angle: { fn: (a: Plain): number => Math.atan2(a.y, a.x) },
    area: { fn: (a: Plain): number => a.x * a.y },
    sum: { fn: (a: Plain): number => a.x + a.y },
    minComponent: { fn: (a: Plain): number => Math.min(a.x, a.y) },
    maxComponent: { fn: (a: Plain): number => Math.max(a.x, a.y) },
    equals: { fn: (a: Plain, o: Plain): boolean => a.x === o.x && a.y === o.y },
    anyNonPositive: { fn: (a: Plain): boolean => a.x <= 0 || a.y <= 0 },
    allPositive: { fn: (a: Plain): boolean => a.x > 0 && a.y > 0 },
    anyNegative: { fn: (a: Plain): boolean => a.x < 0 || a.y < 0 },
    allNonNegative: { fn: (a: Plain): boolean => a.x >= 0 && a.y >= 0 },
    anyZero: { fn: (a: Plain): boolean => a.x === 0 || a.y === 0 },
    allZero: { fn: (a: Plain): boolean => a.x === 0 && a.y === 0 },
    anyLessThan: { fn: (a: Plain, n: number): boolean => a.x < n || a.y < n },
    allLessThan: { fn: (a: Plain, n: number): boolean => a.x < n && a.y < n },
    anyGreaterThan: { fn: (a: Plain, n: number): boolean => a.x > n || a.y > n },
    allGreaterThan: { fn: (a: Plain, n: number): boolean => a.x > n && a.y > n },
  },
};
