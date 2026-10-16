/**
 * The ireko radial pilot (docs/COMPILER.md §13.3, phase C3). The strategy `radial` of ireko
 * (https://github.com/mark1russell7/ireko) puts the children of a box on a ring. This module has the parts of the
 * strategy that have a closed form. These are one child, a part of a ring, and a full ring of more than
 * `PAIRWISE_LIMIT` children. A full ring of 2 to `PAIRWISE_LIMIT` children needs a search for its radius. That search
 * comes in phase C4.
 *
 * `radialArrange` follows the code of ireko step by step. `RADIAL_PROGRAM` is one Vex program that evaluates at each
 * child. The tests compare the two, with the same bits. ireko has the MIT license and the same author.
 */
import { app, axes, each, let_, lit, rec, ref, space, v, type Expr, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { NumDomain, TextDomain } from "@mark1russell7/vex-domains";
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

/** This function tells if the strategy places the children with no search: then the program gives the layout. */
export function radialClosed(input: RadialInput): boolean {
  const n = input.children.length;
  return n <= 1 || input.options.sweep < 360 || n > PAIRWISE_LIMIT;
}

/** This function gives the radius of the circle around the center of a child box that holds its extent. */
function rhoOf(child: RadialChild): number {
  const from = { x: child.box.width / 2, y: child.box.height / 2 };
  const r = child.extent;
  const dx = Math.max(Math.abs(r.x - from.x), Math.abs(r.x + r.width - from.x));
  const dy = Math.max(Math.abs(r.y - from.y), Math.abs(r.y + r.height - from.y));
  return Math.hypot(dx, dy);
}

/** This function arranges the children like the strategy `radial` of ireko. It takes only an input with a closed form. */
export function radialArrange(input: RadialInput): RadialOutput {
  if (!radialClosed(input)) throw new Error(`A full ring of 2 to ${String(PAIRWISE_LIMIT)} children needs the search of ireko.`);
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
    const angle = angles[i] ?? Number.NaN;
    return { x: center.x + r * Math.cos(angle) - child.box.width / 2, y: center.y + r * Math.sin(angle) - child.box.height / 2 };
  });
  return { offsets };
}

// The parts of the program. Each child is a record with its index `i`, the size of its box (`bw`, `bh`) and its
// extent (`ex`, `ey`, `ew`, `eh`). The options are variables.
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const half = (a: Expr): Expr => op("divide", a, lit(2));
/** The distance from the center of the box to the farther side of the extent, on one axis. */
const corner = (at: string, size: string, box: string): Expr =>
  op("max", op("abs", op("subtract", ref(at), half(ref(box)))), op("abs", op("subtract", op("add", ref(at), ref(size)), half(ref(box)))));
/** The radius of the circle around the center of the box of a child that holds its extent. */
const RHO = op("hypot", corner("ex", "ew", "bw"), corner("ey", "eh", "bh"));
/** An angle in degrees, in radians. */
const radians = (degrees: Expr): Expr => op("divide", op("multiply", degrees, lit(Math.PI)), lit(180));

/**
 * The program of the strategy `radial`, for an input with a closed form (`radialClosed`). It evaluates at each child,
 * and it gives the offset of the child. The variables are the options, `mode`, `gap`, `selfW` and `selfH`.
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
      // A full ring has equal angles. A part of a ring has equal parts of the arc, and each child is at the middle of its part.
      $step: op("if", v("$full"), op("divide", op("multiply", lit(2), lit(Math.PI)), v("$n")), op("divide", radians(v("sweep")), v("$n"))),
    },
    let_(
      {
        $r: op("if", v("$one"), v("$floor"), op("max", v("$floor"), op("divide", op("add", op("multiply", lit(2), v("$rhoMax")), v("gap")), op("multiply", lit(2), op("sin", half(v("$step"))))))),
        $angle: op(
          "if",
          v("$one"),
          op("if", v("$full"), v("$start"), op("add", v("$start"), half(op("divide", op("multiply", v("$dir"), op("multiply", v("sweep"), lit(Math.PI))), lit(180))))),
          op("add", v("$start"), op("multiply", op("multiply", v("$dir"), op("if", v("$full"), ref("i"), op("add", ref("i"), lit(0.5)))), v("$step"))),
        ),
        $cx: op("if", v("$linked"), half(v("selfW")), lit(0)),
        $cy: op("if", v("$linked"), half(v("selfH")), lit(0)),
      },
      rec({
        x: op("subtract", op("add", v("$cx"), op("multiply", v("$r"), op("cos", v("$angle")))), half(ref("bw"))),
        y: op("subtract", op("add", v("$cy"), op("multiply", v("$r"), op("sin", v("$angle")))), half(ref("bh"))),
      }),
    ),
  ),
);

/** The kinds of the fields of a child and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const RADIAL_SCHEMA: Schema = {
  fields: { i: "number", bw: "number", bh: "number", ex: "number", ey: "number", ew: "number", eh: "number" },
  vars: { startAngle: "number", sweep: "number", clockwise: "boolean", distance: "number", mode: "string", gap: "number", selfW: "number", selfH: "number" },
};

/** The domains of the program: numbers, and texts for the mode. */
export const RADIAL_DOMAINS: readonly [typeof NumDomain, typeof TextDomain] = [NumDomain, TextDomain];

/** This function gives the space of the children and the variables of a run of the program. */
export function radialRun(input: RadialInput): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  const records = input.children.map((c, i) => ({ i, bw: c.box.width, bh: c.box.height, ex: c.extent.x, ey: c.extent.y, ew: c.extent.width, eh: c.extent.height }));
  return { space: space.array(records), vars: { ...input.options, mode: input.mode, gap: input.gap, selfW: input.self.width, selfH: input.self.height } };
}
