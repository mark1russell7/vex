/**
 * The ireko radial pilot (docs/COMPILER.md §13.3). The strategy `radial` of ireko (https://github.com/mark1russell7/ireko)
 * puts the children of a box on a ring. One child, a part of a ring and a full ring of more than `PAIRWISE_LIMIT`
 * children have a closed form. A full ring of 2 to `PAIRWISE_LIMIT` children searches for its smallest radius. A loop
 * doubles the radius until a test is true, and then a bisection finds it. The test checks each pair of children.
 *
 * `radialArrange` follows the code of ireko step by step. `RADIAL_PROGRAM` is one Vex program that evaluates at each
 * child, with the loops `fold` and `iterate` for the search. The tests compare the two, with the same bits. ireko has
 * the MIT license and the same author.
 */
import { app, axes, each, fold, index, iterate, let_, lit, rec, ref, space, v, type Expr, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import type { Extent } from "./ireko-grid.ts";

/** The options of the strategy `radial`, as in ireko. The angles are in degrees. */
export interface RadialOptions {
  readonly startAngle: number;
  readonly sweep: number;
  readonly clockwise: boolean;
  readonly distance: number;
}

/** A child of the box: the size of its box, and the extent of its subtree relative to the top-left corner of its box. */
export interface RadialChild {
  readonly box: { readonly width: number; readonly height: number };
  readonly extent: Extent;
}

/** The input of one arrangement: the mode, the size of the box itself, its children, the gap and the options. */
export interface RadialInput {
  readonly mode: "nested" | "linked";
  readonly self: { readonly width: number; readonly height: number };
  readonly children: readonly RadialChild[];
  readonly gap: number;
  readonly options: RadialOptions;
}

/** The offset of each child. */
export interface RadialOutput {
  readonly offsets: readonly { readonly x: number; readonly y: number }[];
}

/** Above this number of children, a full ring of ireko uses equal angles. Up to it, ireko searches for the radius. */
export const PAIRWISE_LIMIT = 256;

/** The item at an index that exists by construction. */
const at = (list: readonly number[], i: number): number => list[i] ?? Number.NaN;

/** This function gives the radius of the circle around the center of a child box that holds its extent. */
function rhoOf(child: RadialChild): number {
  const from = { x: child.box.width / 2, y: child.box.height / 2 };
  const r = child.extent;
  const dx = Math.max(Math.abs(r.x - from.x), Math.abs(r.x + r.width - from.x));
  const dy = Math.max(Math.abs(r.y - from.y), Math.abs(r.y + r.height - from.y));
  return Math.hypot(dx, dy);
}

/** This function gives the angle of each child at the radius `r`, or undefined if the angles do not fit in the ring. */
function anglesAt(r: number, need: readonly number[], start: number, direction: number): number[] | undefined {
  const steps = need.map((d) => 2 * Math.asin(Math.min(1, d / (2 * r))));
  const spare = (2 * Math.PI - steps.reduce((a, b) => a + b, 0)) / need.length;
  if (spare < -1e-9) return undefined;
  const out: number[] = [];
  let angle = start;
  for (const step of steps) {
    out.push(angle);
    angle += direction * (step + Math.max(0, spare));
  }
  return out;
}

/** This function tells if the circles of all pairs of children keep apart by the gap. */
function pairsApart(angles: readonly number[], rhos: readonly number[], r: number, gap: number): boolean {
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      const d = Math.abs(at(angles, i) - at(angles, j)) % (2 * Math.PI);
      const chord = 2 * r * Math.sin(Math.min(d, 2 * Math.PI - d) / 2);
      if (chord < at(rhos, i) + at(rhos, j) + gap - 1e-7) return false;
    }
  }
  return true;
}

/** This function gives the smallest radius at which the chords `need` fit in the angle `total`, with a bisection. */
function smallestRadius(need: readonly number[], total: number): number {
  const angle = (r: number): number => need.reduce((sum, d) => sum + 2 * Math.asin(Math.min(1, d / (2 * r))), 0);
  let lo = Math.max(...need) / 2;
  if (angle(lo) <= total) return lo;
  let hi = lo * 2;
  while (angle(hi) > total) hi *= 2;
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (angle(mid) > total) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** This function arranges the children like the strategy `radial` of ireko. */
export function radialArrange(input: RadialInput): RadialOutput {
  const { mode, self, children, options, gap } = input;
  const n = children.length;
  const rhos = children.map(rhoOf);
  const rhoMax = Math.max(...rhos);
  const direction = options.clockwise ? 1 : -1;
  const start = (options.startAngle * Math.PI) / 180;
  const full = options.sweep >= 360;
  const floor = mode === "linked" ? Math.hypot(self.width, self.height) / 2 + rhoMax + (options.distance > 0 ? options.distance : gap) : 0;

  let r: number;
  let angles: number[];
  if (n === 1) {
    r = floor;
    angles = [full ? start : start + (direction * (options.sweep * Math.PI) / 180) / 2];
  } else if (full && n <= PAIRWISE_LIMIT) {
    // The angle that each pair of neighbors needs. The pair (n - 1, 0) closes the ring.
    const need = rhos.map((rho, i) => rho + at(rhos, (i + 1) % n) + gap);
    const ok = (radius: number): boolean => {
      const a = anglesAt(radius, need, start, direction);
      return a !== undefined && pairsApart(a, rhos, radius, gap);
    };
    let lo = Math.max(floor, smallestRadius(need, 2 * Math.PI));
    if (ok(lo)) r = lo;
    else {
      let hi = lo * 2;
      while (!ok(hi)) hi *= 2;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if (ok(mid)) hi = mid;
        else lo = mid;
      }
      r = hi;
    }
    angles = anglesAt(r, need, start, direction) ?? [];
  } else if (full) {
    const step = (2 * Math.PI) / n;
    r = Math.max(floor, (2 * rhoMax + gap) / (2 * Math.sin(step / 2)));
    angles = children.map((_, i) => start + direction * i * step);
  } else {
    const step = (options.sweep * Math.PI) / 180 / n;
    r = Math.max(floor, (2 * rhoMax + gap) / (2 * Math.sin(step / 2)));
    angles = children.map((_, i) => start + direction * (i + 0.5) * step);
  }

  const center = mode === "linked" ? { x: self.width / 2, y: self.height / 2 } : { x: 0, y: 0 };
  const offsets = children.map((child, i) => {
    const angle = at(angles, i);
    return { x: center.x + r * Math.cos(angle) - child.box.width / 2, y: center.y + r * Math.sin(angle) - child.box.height / 2 };
  });
  return { offsets };
}

// The parts of the program. Each child is a record with its index `i`, the size of its box (`bw`, `bh`) and its
// extent (`ex`, `ey`, `ew`, `eh`). The options are variables.
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const half = (a: Expr): Expr => op("divide", a, lit(2));
const TWO_PI = lit(2 * Math.PI);
/** The largest number of doublings of a radius. A finite radius doubles to infinity in fewer steps. */
const DOUBLINGS = 2048;
/** The distance from the center of the box to the farther side of the extent, on one axis. */
const corner = (from: string, size: string, box: string): Expr =>
  op("max", op("abs", op("subtract", ref(from), half(ref(box)))), op("abs", op("subtract", op("add", ref(from), ref(size)), half(ref(box)))));
/** The radius of the circle around the center of the box of a child that holds its extent. */
const RHO = op("hypot", corner("ex", "ew", "bw"), corner("ey", "eh", "bh"));
/** An angle in degrees, in radians. */
const radians = (degrees: Expr): Expr => op("divide", op("multiply", degrees, lit(Math.PI)), lit(180));

// The search of a full ring. A radius is always a name, so each use of it reads a value.
/** The radius of the next child on the ring: after the last child comes the first child. */
const RHO_NEXT = op("ifError", op("first", each(axes.window(1, 1), RHO)), op("first", each(axes.window(0, 0), RHO, [index(0)])));
/** The chord that a child and the next child need: their radii and the gap. */
const NEED = op("add", op("add", RHO, RHO_NEXT), v("gap"));
/** The angle of the chord of a child at the radius `r`. */
const stepAt = (r: Expr): Expr => op("multiply", lit(2), op("asin", op("min", lit(1), op("divide", NEED, op("multiply", lit(2), r)))));
/** The sum of the angles of the chords at the radius `r`, in the order of the children. */
const angleSum = (r: Expr): Expr => op("sum", each(axes.all, stepAt(r)));
/** The angle from a child to the next child at the radius `r`, with the spare angle in the name `$spare`. */
const advance = (r: Expr): Expr => op("multiply", v("$dir"), op("add", stepAt(r), op("max", lit(0), v("$spare"))));
/** The spare angle of each child at the radius `r`. */
const spareAt = (r: Expr): Expr => op("divide", op("subtract", TWO_PI, angleSum(r)), v("$n"));

/** True when two circles at the angles `a` and `b` of a ring of radius `r` are closer than the gap. */
const tooClose = (a: Expr, b: Expr, rhoA: Expr, rhoB: Expr, r: Expr): Expr =>
  let_(
    { $d: op("mod", op("abs", op("subtract", a, b)), TWO_PI) },
    op("lt", op("multiply", op("multiply", lit(2), r), op("sin", half(op("min", v("$d"), op("subtract", TWO_PI, v("$d")))))), op("subtract", op("add", op("add", rhoA, rhoB), v("gap")), lit(1e-7))),
  );

/**
 * True when the angles fit in the ring at the radius `r`, and the circles of each pair keep apart by the gap. A fold
 * over the children gives each angle, from the same sums as ireko. For each child, a fold over the later children
 * gives their angles from its angle.
 */
const fits = (r: Expr): Expr =>
  let_(
    { $spare: spareAt(r) },
    op(
      "and",
      op("not", op("lt", v("$spare"), lit(-1e-9))),
      fold(
        axes.all,
        { ang: v("$start"), ok: lit(true) },
        {
          ang: op("add", v("ang"), advance(r)),
          ok: op(
            "and",
            v("ok"),
            let_(
              { $ai: advance(r), $rhoI: RHO },
              // The later children: a ring of a search has at most PAIRWISE_LIMIT children.
              fold(
                axes.window(1, PAIRWISE_LIMIT),
                { angJ: op("add", v("ang"), v("$ai")), apart: lit(true) },
                { angJ: op("add", v("angJ"), advance(r)), apart: op("and", v("apart"), op("not", tooClose(v("ang"), v("angJ"), v("$rhoI"), RHO, r))) },
                v("apart"),
              ),
            ),
          ),
        },
        v("ok"),
      ),
    ),
  );

/** The middle of the names `lo` and `hi`. */
const MID = half(op("add", v("lo"), v("hi")));

/** The smallest radius at which the chords fit in the ring, as `smallestRadius` of ireko. */
const SMALLEST = let_(
  { $lo0: half(op("max", each(axes.all, NEED))) },
  op(
    "if",
    op("lte", angleSum(v("$lo0")), TWO_PI),
    v("$lo0"),
    let_(
      { $hi0: iterate(DOUBLINGS, { h: op("multiply", v("$lo0"), lit(2)) }, { h: op("multiply", v("h"), lit(2)) }, v("h"), op("not", op("gt", angleSum(v("h")), TWO_PI))) },
      iterate(
        64,
        { lo: v("$lo0"), hi: v("$hi0") },
        {
          lo: let_({ $m: MID }, op("if", op("gt", angleSum(v("$m")), TWO_PI), v("$m"), v("lo"))),
          hi: let_({ $m: MID }, op("if", op("gt", angleSum(v("$m")), TWO_PI), v("hi"), v("$m"))),
        },
        v("hi"),
      ),
    ),
  ),
);

/**
 * The radius of a full ring with a search, as ireko. It is the smallest radius, if the circles fit there. Else a loop
 * doubles it until the circles fit, and then 50 steps of a bisection find it. The name `good` holds the test of the
 * middle, so each step tests once.
 */
const SEARCHED = let_(
  { $lo: op("max", v("$floor"), SMALLEST) },
  op(
    "if",
    fits(v("$lo")),
    v("$lo"),
    let_(
      { $hi: iterate(DOUBLINGS, { h: op("multiply", v("$lo"), lit(2)) }, { h: op("multiply", v("h"), lit(2)) }, v("h"), fits(v("h"))) },
      iterate(
        50,
        { lo: v("$lo"), hi: v("$hi"), good: let_({ $m: half(op("add", v("$lo"), v("$hi"))) }, fits(v("$m"))) },
        {
          lo: op("if", v("good"), v("lo"), MID),
          hi: op("if", v("good"), MID, v("hi")),
          good: let_({ $m: half(op("add", op("if", v("good"), v("lo"), MID), op("if", v("good"), MID, v("hi")))) }, fits(v("$m"))),
        },
        v("hi"),
      ),
    ),
  ),
);

/** The angle of the child at the origin on a searched ring: the sum of the angles of the children before it. */
const SEARCHED_ANGLE = let_(
  { $spare: spareAt(v("$r")) },
  fold(axes.where(axes.all, op("lt", ref("i"), ref("i", [{ t: "origin" }]))), { a: v("$start") }, { a: op("add", v("a"), advance(v("$r"))) }, v("a")),
);

/**
 * The program of the strategy `radial`. It evaluates at each child, and it gives the offset of the child. The variables
 * are the options, `mode`, `gap`, `selfW` and `selfH`.
 */
export const RADIAL_PROGRAM: Expr = let_(
  {
    $n: op("count", each(axes.all, ref("i"))),
    $rhoMax: op("max", each(axes.all, RHO)),
    $dir: op("if", v("clockwise"), lit(1), lit(-1)),
    $start: radians(v("startAngle")),
    $full: op("gte", v("sweep"), lit(360)),
    $linked: op("eq", v("mode"), lit("linked")),
  },
  let_(
    {
      // In the linked mode, no child circle can touch the circle of the node.
      $floor: op("if", v("$linked"), op("add", op("add", half(op("hypot", v("selfW"), v("selfH"))), v("$rhoMax")), op("if", op("gt", v("distance"), lit(0)), v("distance"), v("gap"))), lit(0)),
      $one: op("eq", v("$n"), lit(1)),
      $search: op("and", v("$full"), op("lte", v("$n"), lit(PAIRWISE_LIMIT))),
      // A full ring has equal angles. A part of a ring has equal parts of the arc, and each child is at the middle of its part.
      $step: op("if", v("$full"), op("divide", op("multiply", lit(2), lit(Math.PI)), v("$n")), op("divide", radians(v("sweep")), v("$n"))),
    },
    let_(
      {
        $r: op(
          "if",
          v("$one"),
          v("$floor"),
          op("if", v("$search"), SEARCHED, op("max", v("$floor"), op("divide", op("add", op("multiply", lit(2), v("$rhoMax")), v("gap")), op("multiply", lit(2), op("sin", half(v("$step"))))))),
        ),
        $cx: op("if", v("$linked"), half(v("selfW")), lit(0)),
        $cy: op("if", v("$linked"), half(v("selfH")), lit(0)),
      },
      let_(
        {
          $angle: op(
            "if",
            v("$one"),
            op("if", v("$full"), v("$start"), op("add", v("$start"), half(op("divide", op("multiply", v("$dir"), op("multiply", v("sweep"), lit(Math.PI))), lit(180))))),
            op(
              "if",
              v("$search"),
              SEARCHED_ANGLE,
              op("add", v("$start"), op("multiply", op("multiply", v("$dir"), op("if", v("$full"), ref("i"), op("add", ref("i"), lit(0.5)))), v("$step"))),
            ),
          ),
        },
        rec({
          x: op("subtract", op("add", v("$cx"), op("multiply", v("$r"), op("cos", v("$angle")))), half(ref("bw"))),
          y: op("subtract", op("add", v("$cy"), op("multiply", v("$r"), op("sin", v("$angle")))), half(ref("bh"))),
        }),
      ),
    ),
  ),
);

/** The kinds of the fields of a child and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const RADIAL_SCHEMA: Schema = {
  fields: { i: "number", bw: "number", bh: "number", ex: "number", ey: "number", ew: "number", eh: "number" },
  vars: { startAngle: "number", sweep: "number", clockwise: "boolean", distance: "number", mode: "string", gap: "number", selfW: "number", selfH: "number" },
};

/** The domains of the program: numbers, texts for the mode, and booleans for the tests of the search. */
export const RADIAL_DOMAINS: readonly [typeof NumDomain, typeof TextDomain, typeof BoolDomain] = [NumDomain, TextDomain, BoolDomain];

/** This function gives the space of the children and the variables of a run of the program. */
export function radialRun(input: RadialInput): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  const records = input.children.map((c, i) => ({ i, bw: c.box.width, bh: c.box.height, ex: c.extent.x, ey: c.extent.y, ew: c.extent.width, eh: c.extent.height }));
  return { space: space.array(records), vars: { ...input.options, mode: input.mode, gap: input.gap, selfW: input.self.width, selfH: input.self.height } };
}
