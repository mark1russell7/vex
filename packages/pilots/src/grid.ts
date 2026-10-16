/**
 * The grid pilot (docs/REVIEW.md §11, P5). The grid layout of the Graph project puts items in a uniform
 * row-major grid. The cell is the largest item, and the number of columns comes from the configuration or from
 * the width of the bounds. This module has the layout twice: as plain TypeScript, and as one Vex program that
 * evaluates at each item. The tests show that the two give the same rectangles.
 *
 * Graph is a private repository, so this module does not copy its code. `gridReference` follows the behavior
 * of the Graph strategy, step by step.
 */
import { fail, ok, space, vex, vexError, type ArrayKey, type ChainOf, type ExtHandler, type Merge, type Root } from "@mark1russell7/vex";
import { NumDomain, Vec2Domain } from "@mark1russell7/vex-domains";

/** An item of the layout: its intended size. A missing size counts as 0 for the cell size. */
export interface GridItem {
  readonly width?: number;
  readonly height?: number;
}

/** The configuration of the grid. A `columns` value below 1 means "automatic". The default `gap` is 12. */
export interface GridConfig {
  readonly columns?: number;
  readonly gap?: number;
}

/** The size of the container. */
export interface Bounds {
  readonly width: number;
  readonly height: number;
}

/** The rectangle of one item. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** This function gives the grid layout in plain TypeScript, with the behavior of the Graph strategy. */
export function gridReference(items: readonly GridItem[], bounds: Bounds, config: GridConfig = {}): readonly Rect[] {
  const n = items.length;
  if (n === 0) return [];
  const gap = config.gap ?? 12;
  let cellW = 0;
  let cellH = 0;
  for (const it of items) {
    cellW = Math.max(cellW, it.width ?? 0);
    cellH = Math.max(cellH, it.height ?? 0);
  }
  cellW = Math.max(1, cellW);
  cellH = Math.max(1, cellH);
  let cols = config.columns ?? 0;
  if (!(cols >= 1)) {
    const byWidth = Math.max(1, Math.floor((bounds.width + gap) / (cellW + gap)));
    cols = Math.max(1, Math.min(byWidth, Math.ceil(Math.sqrt(n))));
  }
  return items.map((it, i) => ({
    left: (i % cols) * (cellW + gap),
    top: Math.floor(i / cols) * (cellH + gap),
    width: it.width ?? cellW,
    height: it.height ?? cellH,
  }));
}

/**
 * The extension `slot`: the position of the focus in an array space, like `ROW()` in a spreadsheet. Inside an
 * axis, the focus is the target, so the slot is the slot of the target.
 */
export const slot: ExtHandler = (_data, ctx) => {
  const c = ctx.space.coords(ctx.position.focus);
  return c?.[0] === undefined ? fail(vexError("no-offset", `the key "${ctx.position.focus}" has no slot`, { path: ctx.path })) : ok(c[0]);
};

/** The context of the grid programs: the domains of numbers and of 2D vectors, an array space and the fields of `GridItem`. */
export type GridContext = { readonly domains: readonly [typeof NumDomain, typeof Vec2Domain]; readonly keys: ArrayKey; readonly record: Merge<GridItem> };

/** The root of the grid programs. */
export type GridRoot = Root<GridContext>;

/** The chain of the grid program. Its value is the rectangle of the item at the focus. */
export type GridChain = ChainOf<GridContext, { readonly left: number; readonly top: number; readonly width: number; readonly height: number }>;

/** This function makes the root of the grid programs over a list of items. */
export const gridRoot = (items: readonly GridItem[]): GridRoot => vex(NumDomain, Vec2Domain).withOptions({ extensions: { slot } }).over(space.array(items));

/**
 * This function makes the Vex program of the grid layout. The bounds and the configuration are constants of the
 * program. The sizes of the items are fields of the space.
 *
 * The math of the two dimensions is the same, so the program calculates it once, with vectors of `Vec2Domain`. The op
 * `vec2` makes a vector from two numbers, and the ops `x` and `y` give its components.
 */
export function gridProgram(root: GridRoot, bounds: Bounds, config: GridConfig = {}): GridChain {
  const gap = config.gap ?? 12;
  // The cell: the component-wise maximum of the sizes of the items. A missing size counts as 0, and the cell is at
  // least 1 by 1. The op max of Vec2 lifts the number 1 to the vector (1, 1).
  const cell = root
    .start(0)
    .each((t) => t.from("width").ifError(0)._.vec2(t.from("height").ifError(0)))
    .reduce("max")
    ._.max(1);
  // The step from one cell to the next, in the two dimensions: the cell and the gap.
  const pitch = cell._.add(gap);
  const count = root.start(0).each((t) => t).count();
  const configured = config.columns ?? 0;
  const cols =
    configured >= 1
      ? root.start(configured)
      : root
          .start(bounds.width + gap)
          ._.divide(pitch._.x())
          ._.floor()
          ._.max(1)
          ._.min(count._.sqrt()._.ceil())
          ._.max(1);
  const i = root.start(root.ext<number>("slot"));
  // The corner of the item: its column and its row, as one vector, times the pitch.
  const corner = i._.mod(cols)._.vec2(i._.divide(cols)._.floor())._.multiply(pitch);
  return root.start(
    root.rec({
      left: corner._.x(),
      top: corner._.y(),
      width: root.from("width").ifError(cell._.x()),
      height: root.from("height").ifError(cell._.y()),
    }),
  );
}

/** This function gives the grid layout from the Vex program: the rectangle at each item, in the item order. */
export function gridVex(items: readonly GridItem[], bounds: Bounds, config: GridConfig = {}): readonly Rect[] {
  const root = gridRoot(items);
  return gridProgram(root, bounds, config).all().values();
}
