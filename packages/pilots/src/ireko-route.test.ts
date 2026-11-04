import { compile, space, type Expr, type Result, type Space } from "@mark1russell7/vex";
import { tiered, type Schema } from "@mark1russell7/vex-compiler";
import { emitModule } from "@mark1russell7/vex-compiler/module";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { directedEdge, routeLattice, routeNodes, routerEdge } from "./inputs.ts";
import {
  AVOID_PROGRAM,
  AVOID_SCHEMA,
  avoidRecords,
  avoidRun,
  cleaned,
  directionRecords,
  EDGE_DIRECTION_PROGRAM,
  EDGE_DIRECTION_SCHEMA,
  LABEL_BOX_PROGRAM,
  LABEL_BOX_SCHEMA,
  nodeRecords,
  OBSTACLES_PROGRAM,
  OBSTACLES_SCHEMA,
  obstaclesRun,
  ORTHOGONAL_PROGRAM,
  ROUTE_DOMAINS,
  ROUTER_SCHEMA,
  routerRecords,
  STRAIGHT_PROGRAM,
  type DirectedEdge,
  type RouteDirection,
  type RouteNode,
  type RoutePoint,
  type RouteRect,
  type RouterEdge,
} from "./ireko-route.ts";

/** The copies of the constants of ireko. */
const MAX_OBSTACLES = 32;
const MARGIN = 10;
const BEND = 40;
const EPSILON = 1e-6;

/** The item at an index that exists by construction. */
function at<T>(list: ArrayLike<T>, i: number): T {
  const value = list[i];
  if (value === undefined) throw new RangeError(`No item at the index ${String(i)}.`);
  return value;
}

const r = (x: number, y: number, width: number, height: number): RouteRect => ({ x, y, width, height });
const centerOf = (b: RouteRect): RoutePoint => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** The copy of `contains` of ireko, with a tolerance of 0. */
const contains = (outer: RouteRect, inner: RouteRect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** The copy of `nestedPair` of ireko. */
const nestedPair = (a: RouteRect, b: RouteRect): boolean => contains(a, b) || contains(b, a);

/** The copy of `borderPoint` of ireko. */
function borderPoint(box: RouteRect, toward: RoutePoint): RoutePoint {
  const c = centerOf(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The copy of the router `straight` of ireko. */
function straight({ source, target }: RouterEdge): RoutePoint[] {
  const a = centerOf(source);
  const b = centerOf(target);
  if (nestedPair(source, target)) return [a, b];
  return [borderPoint(source, b), borderPoint(target, a)];
}

/** The copy of the two branches of each function of ireko: one segment on one line, or a turn at the middle. */
function vertical(start: RoutePoint, end: RoutePoint): RoutePoint[] {
  if (start.x === end.x) return [start, end];
  const mid = (start.y + end.y) / 2;
  return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
}

function horizontal(start: RoutePoint, end: RoutePoint): RoutePoint[] {
  if (start.y === end.y) return [start, end];
  const mid = (start.x + end.x) / 2;
  return [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end];
}

/** The copy of `elbow` of ireko. */
function elbow(source: RouteRect, target: RouteRect, direction: RouteDirection): RoutePoint[] | undefined {
  const a = centerOf(source);
  const b = centerOf(target);
  if (direction === "down" || direction === "up") {
    const down = direction === "down";
    const start = { x: a.x, y: down ? source.y + source.height : source.y };
    const end = { x: b.x, y: down ? target.y : target.y + target.height };
    if (down ? end.y <= start.y : end.y >= start.y) return undefined;
    return vertical(start, end);
  }
  const right = direction === "right";
  const start = { x: right ? source.x + source.width : source.x, y: a.y };
  const end = { x: right ? target.x : target.x + target.width, y: b.y };
  if (right ? end.x <= start.x : end.x >= start.x) return undefined;
  return horizontal(start, end);
}

/** The copy of the router `orthogonal` of ireko. */
function orthogonal(edge: RouterEdge): RoutePoint[] {
  const { source, target, direction } = edge;
  const a = centerOf(source);
  const b = centerOf(target);
  if (nestedPair(source, target)) return [a, b];
  const tree = direction === undefined ? undefined : elbow(source, target, direction);
  if (tree !== undefined) return tree;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    const down = dy > 0;
    const start = { x: a.x, y: down ? source.y + source.height : source.y };
    const end = { x: b.x, y: down ? target.y : target.y + target.height };
    if (down ? end.y < start.y : end.y > start.y) return straight({ source, target });
    return vertical(start, end);
  }
  const right = dx > 0;
  const start = { x: right ? source.x + source.width : source.x, y: a.y };
  const end = { x: right ? target.x : target.x + target.width, y: b.y };
  if (right ? end.x < start.x : end.x > start.x) return straight({ source, target });
  return horizontal(start, end);
}

/** The copy of `clean` of ireko. */
const clean = (value: number): number => (Math.abs(value) < 1e-9 ? 0 : value);

/** The copy of `forward` of ireko. */
function forward(a: RouteRect, b: RouteRect, d: RouteDirection): boolean {
  switch (d) {
    case "down":
      return b.y >= a.y + a.height;
    case "up":
      return b.y + b.height <= a.y;
    case "right":
      return b.x >= a.x + a.width;
    case "left":
      return b.x + b.width <= a.x;
  }
}

/** The copy of the choice of the direction of an edge in the route pass of ireko. The empty text is no direction. */
function directionOf(e: DirectedEdge): string {
  if (e.kind === "tree") return e.parentDirection ?? "";
  return e.flow !== undefined && forward(e.source, e.target, e.flow) ? e.flow : "";
}

const NARROW = new Set("ijl.,:;|!'`".split(""));
const SEMI = new Set('ftrI()[]{}-/\\"'.split(""));
const WIDE = new Set("mwMW@%".split(""));

/** The copy of `widthOfCharacter` of ireko. */
function widthOfCharacter(ch: string): number {
  if (ch === " ") return 0.28;
  if (NARROW.has(ch)) return 0.27;
  if (SEMI.has(ch)) return 0.36;
  if (WIDE.has(ch)) return 0.86;
  if (ch >= "A" && ch <= "Z") return 0.66;
  if (ch >= "0" && ch <= "9") return 0.56;
  if (ch >= "a" && ch <= "z") return 0.52;
  return (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.6;
}

/** The copy of `estimateWidth` of ireko. */
function estimateWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) em += widthOfCharacter(ch);
  return em * fontSize;
}

/** The copy of `labelBoxOf` of ireko. */
function labelBoxOf(c: RouteNode): RouteRect {
  const size = 13 * c.scale;
  return { x: c.x + 4 * c.scale, y: c.y + 2 * c.scale, width: Math.min(c.width - 8 * c.scale, estimateWidth(c.label, size) + 8 * c.scale), height: size + 8 * c.scale };
}

/** The copy of `obstaclesOf` of ireko. The field `lastChild` holds the last item of `children`. */
function obstaclesOf(nodes: readonly RouteNode[], s: number, t: number): RouteRect[] {
  const n = nodes.length;
  const end = new Int32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const last = at(nodes, i).lastChild;
    end[i] = last < 0 ? i + 1 : at(end, last);
  }
  const holds = (a: number, b: number): boolean => b > a && b < at(end, a) && at(nodes, a).mode === "nested";
  const a = at(nodes, s);
  const b = at(nodes, t);
  const middle = { x: (a.x + a.width / 2 + b.x + b.width / 2) / 2, y: (a.y + a.height / 2 + b.y + b.height / 2) / 2 };
  const found: { box: RouteRect; d: number }[] = [];
  const labels: RouteRect[] = [];
  for (let i = 0; i < n; i++) {
    if (i === s || i === t || holds(s, i) || holds(t, i)) continue;
    const node = at(nodes, i);
    if (holds(i, s) || holds(i, t)) {
      labels.push(labelBoxOf(node));
      continue;
    }
    const d = Math.hypot(node.x + node.width / 2 - middle.x, node.y + node.height / 2 - middle.y);
    found.push({ box: { x: node.x, y: node.y, width: node.width, height: node.height }, d });
  }
  return [
    ...found
      .toSorted((p, q) => p.d - q.d)
      .slice(0, MAX_OBSTACLES)
      .map((f) => f.box),
    ...labels,
  ];
}

type Side = "top" | "bottom" | "left" | "right";
const SIDES: readonly Side[] = ["bottom", "right", "top", "left"];
const OUT: Readonly<Record<Side, RoutePoint>> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const FROM: Readonly<Record<RouteDirection, Side>> = { down: "bottom", up: "top", left: "left", right: "right" };
const INTO: Readonly<Record<RouteDirection, Side>> = { down: "top", up: "bottom", left: "right", right: "left" };
const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 1],
  [0, -1, 1],
];

/** The copy of `grow` of ireko. */
const grow = (b: RouteRect): RouteRect => r(b.x - MARGIN, b.y - MARGIN, b.width + 2 * MARGIN, b.height + 2 * MARGIN);

/** The copy of `portOf` of ireko. */
function portOf(b: RouteRect, side: Side): RoutePoint {
  const c = centerOf(b);
  return { x: c.x + (OUT[side].x * b.width) / 2, y: c.y + (OUT[side].y * b.height) / 2 };
}

/** The copy of `stubOf` of ireko. */
function stubOf(b: RouteRect, side: Side): RoutePoint {
  const p = portOf(b, side);
  return { x: p.x + OUT[side].x * MARGIN, y: p.y + OUT[side].y * MARGIN };
}

/** The copy of `find` of ireko. */
function find(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(sorted, mid) < value - EPSILON) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The copy of `axis` of ireko. */
function axis(values: readonly number[]): number[] {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.filter((value, i) => i === 0 || value - at(sorted, i - 1) > EPSILON);
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;

/** The copy of `simplify` of ireko. */
function simplify(points: readonly RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const p of points) {
    const a = out.at(-2);
    const b = out.at(-1);
    if (b !== undefined && near(b.x, p.x) && near(b.y, p.y)) continue;
    if (a !== undefined && b !== undefined && ((near(a.x, b.x) && near(b.x, p.x)) || (near(a.y, b.y) && near(b.y, p.y)))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** The copy of `Heap` of ireko. The tie order of the heap decides the route. */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (at(this.keys, p) <= at(this.keys, i)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    if (this.items.length === 0) return -1;
    const top = at(this.items, 0);
    const lastItem = this.items.pop() ?? -1;
    const lastKey = this.keys.pop() ?? 0;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let m = i;
        if (left < this.items.length && at(this.keys, left) < at(this.keys, m)) m = left;
        if (right < this.items.length && at(this.keys, right) < at(this.keys, m)) m = right;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const item = at(this.items, a);
    const key = at(this.keys, a);
    this.items[a] = at(this.items, b);
    this.keys[a] = at(this.keys, b);
    this.items[b] = item;
    this.keys[b] = key;
  }
}

/** The copy of `search` of ireko. */
function search({ source, target, direction }: RouterEdge, boxes: readonly RouteRect[]): RoutePoint[] | undefined {
  const toward = { x: centerOf(target).x - centerOf(source).x, y: centerOf(target).y - centerOf(source).y };
  const starts = (direction === undefined ? SIDES : [FROM[direction]]).map((side) => ({ side, stub: stubOf(source, side) }));
  const ends = (direction === undefined ? SIDES : [INTO[direction]]).map((side) => ({ side, stub: stubOf(target, side) }));
  const all = [...starts, ...ends].map((e) => e.stub);

  const left = Math.min(...boxes.map((b) => b.x), ...all.map((p) => p.x)) - MARGIN;
  const right = Math.max(...boxes.map((b) => b.x + b.width), ...all.map((p) => p.x)) + MARGIN;
  const top = Math.min(...boxes.map((b) => b.y), ...all.map((p) => p.y)) - MARGIN;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height), ...all.map((p) => p.y)) + MARGIN;
  const xs = axis([left, right, ...boxes.flatMap((b) => [b.x, b.x + b.width]), ...all.map((p) => p.x)]);
  const ys = axis([top, bottom, ...boxes.flatMap((b) => [b.y, b.y + b.height]), ...all.map((p) => p.y)]);
  const w = xs.length;
  const h = ys.length;
  const free = new Uint8Array(w * h).fill(1);
  const openX = new Uint8Array(w * h).fill(1);
  const openY = new Uint8Array(w * h).fill(1);
  for (const b of boxes) {
    const x0 = find(xs, b.x);
    const x1 = find(xs, b.x + b.width);
    const y0 = find(ys, b.y);
    const y1 = find(ys, b.y + b.height);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const k = j * w + i;
        if (i > x0 && i < x1 && j > y0 && j < y1) free[k] = 0;
        if (i < x1 && j > y0 && j < y1) openX[k] = 0;
        if (j < y1 && i > x0 && i < x1) openY[k] = 0;
      }
    }
  }
  const open = (i: number, j: number, di: number, dj: number): boolean => {
    const k = j + dj;
    const l = i + di;
    if (l < 0 || l >= w || k < 0 || k >= h || at(free, k * w + l) === 0) return false;
    if (di !== 0) return at(openX, j * w + Math.min(i, l)) === 1;
    return at(openY, Math.min(j, k) * w + i) === 1;
  };
  const gridIndex = (p: RoutePoint): number => {
    const i = xs.findIndex((x) => Math.abs(x - p.x) <= EPSILON);
    const j = ys.findIndex((y) => Math.abs(y - p.y) <= EPSILON);
    return i < 0 || j < 0 ? -1 : j * w + i;
  };

  const goals = new Map<number, { side: Side; axis: number }>();
  for (const e of ends) {
    const g = gridIndex(e.stub);
    if (g >= 0 && at(free, g) === 1) goals.set(g, { side: e.side, axis: e.side === "top" || e.side === "bottom" ? 1 : 0 });
  }
  if (goals.size === 0) return undefined;
  const goalPoints = [...goals.keys()].map((g) => ({ x: at(xs, g % w), y: at(ys, Math.floor(g / w)) }));
  const estimate = (i: number, j: number): number => Math.min(...goalPoints.map((g) => Math.abs(g.x - at(xs, i)) + Math.abs(g.y - at(ys, j))));

  const size = w * h * 2;
  const cost = new Float64Array(size).fill(Infinity);
  const back = new Int32Array(size).fill(-1);
  const heap = new Heap();
  for (const s of starts) {
    const g = gridIndex(s.stub);
    if (g < 0 || at(free, g) === 0) continue;
    const first = s.side === "top" || s.side === "bottom" ? 1 : 0;
    const away = OUT[s.side].x * toward.x + OUT[s.side].y * toward.y < 0 ? BEND : 0;
    const state = g * 2 + first;
    if (away < at(cost, state)) {
      cost[state] = away;
      heap.push(state, away + estimate(g % w, Math.floor(g / w)));
    }
  }

  let best = -1;
  let bestCost = Infinity;
  for (let state = heap.pop(); state >= 0; state = heap.pop()) {
    const c = at(cost, state);
    if (c >= bestCost) break;
    const g = state >> 1;
    const last = state & 1;
    const goal = goals.get(g);
    if (goal !== undefined) {
      const total = c + (goal.axis === last ? 0 : BEND);
      if (total < bestCost) {
        bestCost = total;
        best = state;
      }
    }
    const i = g % w;
    const j = Math.floor(g / w);
    for (const [di, dj, ax] of STEPS) {
      if (!open(i, j, di, dj)) continue;
      const next = (j + dj) * w + (i + di);
      const length = Math.abs(at(xs, i + di) - at(xs, i)) + Math.abs(at(ys, j + dj) - at(ys, j));
      const nc = c + length + (ax === last ? 0 : BEND);
      const ns = next * 2 + ax;
      if (nc < at(cost, ns)) {
        cost[ns] = nc;
        back[ns] = state;
        heap.push(ns, nc + estimate(i + di, j + dj));
      }
    }
  }
  if (best < 0) return undefined;

  const path: RoutePoint[] = [];
  for (let state = best; state >= 0; state = at(back, state)) {
    const g = state >> 1;
    path.push({ x: at(xs, g % w), y: at(ys, Math.floor(g / w)) });
  }
  path.reverse();
  const begin = at(path, 0);
  const start = starts.find((e) => Math.abs(e.stub.x - begin.x) <= EPSILON && Math.abs(e.stub.y - begin.y) <= EPSILON);
  const end = goals.get(best >> 1);
  if (start === undefined || end === undefined) return undefined;
  return simplify([portOf(source, start.side), ...path, portOf(target, end.side)]);
}

/** The copy of the router `avoid` of ireko. */
function avoid(edge: RouterEdge): RoutePoint[] {
  const { source, target } = edge;
  if (nestedPair(source, target)) return [centerOf(source), centerOf(target)];
  return search(edge, [...(edge.obstacles ?? []), source, target].map((b) => grow(b))) ?? orthogonal(edge);
}

/** A function of a standalone module. */
type ModuleRun = (records: unknown, vars: unknown) => readonly unknown[];

/** This function gives the function of the standalone module of a program. */
function moduleOf(program: Expr, schema: Schema): ModuleRun {
  const m = emitModule(program, { domains: ROUTE_DOMAINS, schema, name: "route", lists: "plain" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return route;`)() as ModuleRun;
}

/** One item of a list of a tier. */
interface ListItem {
  readonly result: Result<unknown>;
}

/** This function gives the value of a run as plain data: the items of a list of the interpreter or of tier 2. */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  const list = value as { readonly items: readonly ListItem[] };
  return list.items.map((item) => {
    if (!item.result.ok) throw new Error(`${item.result.error.code}: ${item.result.error.message}`);
    return item.result.value;
  });
}

/** A tier of a program. */
type Tier = { run(r: { readonly space: Space; readonly origin: string; readonly vars?: Readonly<Record<string, unknown>> }): Result<unknown> };

/** This function gives the plain value of a program at one key. */
function runAt(tier: Tier, s: Space, origin: string, vars: Readonly<Record<string, unknown>> = {}): unknown {
  const result = tier.run({ space: s, origin, vars });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return plain(result.value);
}

/** This function gives the plain value of a program at each key of a list of records. */
const runEach = (tier: Tier, records: readonly Readonly<Record<string, unknown>>[]): unknown[] => {
  const s = space.array(records);
  return s.keys.map((origin) => runAt(tier, s, origin));
};

/** The points of a route after the function `clean`, as the route pass gives them. */
const cleanedRoute = (points: readonly RoutePoint[]): RoutePoint[] => points.map((p) => ({ x: clean(p.x), y: clean(p.y) }));

/** This function gives a value of the module of `avoid`. It gives the same value at each box. */
function avoidValue(run: ModuleRun, edge: RouterEdge): unknown {
  const { vars } = avoidRun(edge);
  return at(run(avoidRecords(edge), vars), 0);
}

const SOURCE = r(0, 0, 100, 50);
const TARGET = r(400, 0, 100, 50);

/** The inputs of the tests of ireko, and the points that the routers of ireko gave for them on 2026-11-04. */
const FIXED: readonly (readonly [string, RouterEdge, RoutePoint[], RoutePoint[], RoutePoint[]])[] = [
  [
    "around a wall",
    { source: SOURCE, target: TARGET, obstacles: [r(200, -40, 60, 130)] },
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
    [{ x: 50, y: 50 }, { x: 50, y: 100 }, { x: 450, y: 100 }, { x: 450, y: 50 }],
  ],
  [
    "the sides of a direction",
    { source: SOURCE, target: r(300, 200, 100, 50), direction: "down", obstacles: [r(130, 100, 60, 60)] },
    [{ x: 87.5, y: 50 }, { x: 312.5, y: 200 }],
    [{ x: 50, y: 50 }, { x: 50, y: 125 }, { x: 350, y: 125 }, { x: 350, y: 200 }],
    [{ x: 50, y: 50 }, { x: 50, y: 190 }, { x: 350, y: 190 }, { x: 350, y: 200 }],
  ],
  [
    "two aligned boxes",
    { source: SOURCE, target: TARGET, obstacles: [] },
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
  ],
  [
    "nested boxes",
    { source: r(0, 0, 200, 200), target: r(50, 50, 20, 20) },
    [{ x: 100, y: 100 }, { x: 60, y: 60 }],
    [{ x: 100, y: 100 }, { x: 60, y: 60 }],
    [{ x: 100, y: 100 }, { x: 60, y: 60 }],
  ],
  [
    "a cage around the target",
    { source: SOURCE, target: TARGET, obstacles: [r(330, -60, 240, 40), r(330, 80, 240, 40), r(330, -60, 40, 180), r(530, -60, 40, 180)] },
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
    [{ x: 100, y: 25 }, { x: 400, y: 25 }],
  ],
  [
    "a direction with no gap",
    { source: SOURCE, target: r(30, 20, 100, 50), direction: "down", obstacles: [] },
    [{ x: 87.5, y: 50 }, { x: 42.5, y: 20 }],
    [{ x: 87.5, y: 50 }, { x: 42.5, y: 20 }],
    [{ x: 87.5, y: 50 }, { x: 42.5, y: 20 }],
  ],
];

/** The inputs where a tie or a closed stub decides the route. The points are the output of `avoid` of ireko on 2026-11-04. */
const DECIDED: readonly (readonly [string, RouterEdge, RoutePoint[]])[] = [
  [
    "a child of the heap with the key of its parent",
    { source: r(-100, 0, 40, 20), target: r(40, -20, 60, 60), obstacles: [r(-80, 20, 40, 20)], direction: "left" },
    [{ x: -100, y: 10 }, { x: -110, y: 10 }, { x: -110, y: 50 }, { x: 110, y: 50 }, { x: 110, y: 10 }, { x: 100, y: 10 }],
  ],
  ["two goals with an equal cost", { source: r(40, -60, 60, 40), target: r(20, -60, 20, 40), obstacles: [] }, [{ x: 70, y: -20 }, { x: 70, y: -10 }, { x: 30, y: -10 }, { x: 30, y: -20 }]],
  [
    "a stub of the target inside a box",
    { source: r(20, -60, 60, 20), target: r(20, -100, 60, 40), obstacles: [r(100, 80, 40, 60), r(20, -100, 20, 0), r(0, 100, 0, 40), r(40, 80, 60, 40), r(20, -40, 20, 60), r(-100, -20, 40, 60)] },
    [{ x: 80, y: -50 }, { x: 90, y: -50 }, { x: 90, y: -80 }, { x: 80, y: -80 }],
  ],
  [
    "a route along the frame of the grid",
    { source: r(-40, -20, 60, 60), target: r(100, -40, 40, 60), obstacles: [r(-100, 0, 40, 20)], direction: "left" },
    [{ x: -40, y: 10 }, { x: -50, y: 10 }, { x: -50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: -10 }, { x: 140, y: -10 }],
  ],
];

describe("the ireko route pilot", () => {
  const programs = {
    straight: { interpreted: compile(STRAIGHT_PROGRAM, { domains: ROUTE_DOMAINS }), generated: tiered(STRAIGHT_PROGRAM, { domains: ROUTE_DOMAINS }) },
    orthogonal: { interpreted: compile(ORTHOGONAL_PROGRAM, { domains: ROUTE_DOMAINS }), generated: tiered(ORTHOGONAL_PROGRAM, { domains: ROUTE_DOMAINS }) },
    direction: { interpreted: compile(EDGE_DIRECTION_PROGRAM, { domains: ROUTE_DOMAINS }), generated: tiered(EDGE_DIRECTION_PROGRAM, { domains: ROUTE_DOMAINS }) },
    label: { interpreted: compile(LABEL_BOX_PROGRAM, { domains: ROUTE_DOMAINS }), generated: tiered(LABEL_BOX_PROGRAM, { domains: ROUTE_DOMAINS }) },
    obstacles: { interpreted: compile(OBSTACLES_PROGRAM, { domains: ROUTE_DOMAINS }), generated: tiered(OBSTACLES_PROGRAM, { domains: ROUTE_DOMAINS }) },
    avoid: { interpreted: compile(AVOID_PROGRAM, { domains: ROUTE_DOMAINS }), generated: tiered(AVOID_PROGRAM, { domains: ROUTE_DOMAINS }) },
  };
  const modules = {
    straight: moduleOf(STRAIGHT_PROGRAM, ROUTER_SCHEMA),
    orthogonal: moduleOf(ORTHOGONAL_PROGRAM, ROUTER_SCHEMA),
    cleaned: moduleOf(cleaned(ORTHOGONAL_PROGRAM), ROUTER_SCHEMA),
    direction: moduleOf(EDGE_DIRECTION_PROGRAM, EDGE_DIRECTION_SCHEMA),
    label: moduleOf(LABEL_BOX_PROGRAM, LABEL_BOX_SCHEMA),
    obstacles: moduleOf(OBSTACLES_PROGRAM, OBSTACLES_SCHEMA),
    avoid: moduleOf(AVOID_PROGRAM, AVOID_SCHEMA),
  };

  it("COMPILE.TIERED: tier 2 takes each program", () => {
    expect(Object.values(programs).map((p) => p.generated.tier)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("COMPILE.MODULE: the modules of the routers straight and orthogonal give the points of ireko with the same bits", () => {
    fc.assert(
      fc.property(fc.array(routerEdge(0), { minLength: 1, maxLength: 8 }), (edges) => {
        const records = routerRecords(edges);
        expect(modules.straight(records, {})).toEqual(edges.map((e) => straight(e)));
        expect(modules.orthogonal(records, {})).toEqual(edges.map((e) => orthogonal(e)));
      }),
    );
  });

  it("COMPILE.MODULE: the routers straight and orthogonal give the points of ireko for boxes on a lattice, with equal places", () => {
    fc.assert(
      fc.property(fc.array(routerEdge(0, routeLattice), { minLength: 8, maxLength: 16 }), (edges) => {
        const records = routerRecords(edges);
        expect(modules.straight(records, {})).toEqual(edges.map((e) => straight(e)));
        expect(modules.orthogonal(records, {})).toEqual(edges.map((e) => orthogonal(e)));
      }),
    );
  });

  it("COMPILE.TIERED: the routers straight and orthogonal give the points of ireko in the interpreter and in tier 2", () => {
    fc.assert(
      fc.property(fc.array(routerEdge(0), { minLength: 1, maxLength: 4 }), (edges) => {
        const records = routerRecords(edges);
        const straightPoints = edges.map((e) => straight(e));
        const orthogonalPoints = edges.map((e) => orthogonal(e));
        expect(runEach(programs.straight.interpreted, records)).toEqual(straightPoints);
        expect(runEach(programs.straight.generated, records)).toEqual(straightPoints);
        expect(runEach(programs.orthogonal.interpreted, records)).toEqual(orthogonalPoints);
        expect(runEach(programs.orthogonal.generated, records)).toEqual(orthogonalPoints);
      }),
      { numRuns: 40 },
    );
  });

  it("the function cleaned gives the function clean of ireko on each point, and it replaces -0", () => {
    const tiny: RouterEdge = { source: r(-1e-10, -1e-10, 0, 0), target: r(-1e-10, 300, 0, 0) };
    expect(modules.cleaned(routerRecords([tiny]), {})).toEqual([cleanedRoute(orthogonal(tiny))]);
    expect(at(modules.cleaned(routerRecords([tiny]), {}), 0)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 300 }]);
    const small: RouterEdge = { source: r(5e-9, 5e-9, 0, 0), target: r(5e-9, 300, 0, 0) };
    expect(at(modules.cleaned(routerRecords([small]), {}), 0)).toEqual([{ x: 5e-9, y: 5e-9 }, { x: 5e-9, y: 300 }]);
    fc.assert(
      fc.property(routerEdge(0), (e) => {
        expect(modules.cleaned(routerRecords([e]), {})).toEqual([cleanedRoute(orthogonal(e))]);
      }),
    );
  });

  it("the program of the direction gives the direction of the route pass of ireko in each tier", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(directedEdge(), directedEdge(routeLattice)), { minLength: 1, maxLength: 8 }), (edges) => {
        const records = directionRecords(edges);
        const expected = edges.map((e) => directionOf(e));
        expect(modules.direction(records, {})).toEqual(expected);
        const s = space.array(records);
        expect(s.keys.map((origin) => programs.direction.interpreted.run({ space: s, origin }))).toEqual(expected.map((value) => ({ ok: true, value })));
        expect(s.keys.map((origin) => programs.direction.generated.run({ space: s, origin }))).toEqual(expected.map((value) => ({ ok: true, value })));
      }),
      { numRuns: 40 },
    );
  });

  it("the program of the direction takes a box that touches the source as forward", () => {
    const source = r(0, 0, 10, 10);
    const edges: DirectedEdge[] = [
      { kind: "extra", source, target: r(0, 10, 10, 10), flow: "down" },
      { kind: "extra", source, target: r(0, -10, 10, 10), flow: "up" },
      { kind: "extra", source, target: r(10, 0, 10, 10), flow: "right" },
      { kind: "extra", source, target: r(-10, 0, 10, 10), flow: "left" },
    ];
    expect(modules.direction(directionRecords(edges), {})).toEqual(["down", "up", "right", "left"]);
    expect(edges.map((e) => directionOf(e))).toEqual(["down", "up", "right", "left"]);
  });

  it("the program of the label gives the box of labelBoxOf of ireko in each tier", () => {
    fc.assert(
      fc.property(routeNodes(5), ({ nodes }) => {
        const records = nodeRecords(nodes);
        const expected = nodes.map((n) => labelBoxOf(n));
        expect(modules.label(records, {})).toEqual(expected);
        const s = space.array(records);
        expect(s.keys.map((origin) => programs.label.interpreted.run({ space: s, origin }))).toEqual(expected.map((value) => ({ ok: true, value })));
        expect(s.keys.map((origin) => programs.label.generated.run({ space: s, origin }))).toEqual(expected.map((value) => ({ ok: true, value })));
      }),
      { numRuns: 40 },
    );
  });

  it("the program of the label reads the first code point of a wide script", () => {
    const nodes = ["\u2e7f", "\u2e80"].map((label): RouteNode => ({ ...r(0, 0, 500, 40), scale: 1, label, mode: "nested", lastChild: -1 }));
    expect(modules.label(nodeRecords(nodes), {})).toEqual(nodes.map((n) => labelBoxOf(n)));
  });

  it("the program reads the code points of a label, and a character outside the plane of 16 bits is one code point", () => {
    const nodes: RouteNode[] = [{ ...r(0, 0, 500, 40), scale: 1, label: "a\u{1f600}", mode: "nested", lastChild: -1 }];
    expect(nodeRecords(nodes)[0]?.["label"]).toBe("a\u{1f600}");
    expect(modules.label(nodeRecords(nodes), {})).toEqual([{ x: 4, y: 2, width: 1.52 * 13 + 8, height: 21 }]);
  });

  it("COMPILE.MODULE: the module of the obstacles gives the obstacles of ireko with the same bits", () => {
    fc.assert(
      fc.property(routeNodes(50), ({ nodes, s, t }) => {
        const { space: records, vars } = obstaclesRun(nodes, s, t);
        expect(at(modules.obstacles(records.records, vars), 0)).toEqual(obstaclesOf(nodes, s, t));
      }),
    );
  });

  it("COMPILE.TIERED: the program of the obstacles gives the obstacles of ireko in the interpreter and in tier 2", () => {
    fc.assert(
      fc.property(routeNodes(8), ({ nodes, s, t }) => {
        const { space: records, vars } = obstaclesRun(nodes, s, t);
        const expected = obstaclesOf(nodes, s, t);
        expect(runAt(programs.obstacles.interpreted, records, "0", vars)).toEqual(expected);
        expect(runAt(programs.obstacles.generated, records, "0", vars)).toEqual(expected);
      }),
      { numRuns: 40 },
    );
  });

  it("the obstacles keep the 32 nearest boxes, and a container of an end gives its label after them", () => {
    const leaf = (x: number): RouteNode => ({ ...r(x, 0, 10, 10), scale: 1, label: "", mode: "linked", lastChild: -1 });
    const count = 40;
    const nodes: RouteNode[] = [{ ...r(0, 0, 1000, 100), scale: 1, label: "g", mode: "nested", lastChild: count }, ...Array.from({ length: count }, (_, i) => leaf(20 * i))];
    const { space: records, vars } = obstaclesRun(nodes, 1, 2);
    const obstacles = at(modules.obstacles(records.records, vars), 0) as readonly RouteRect[];
    expect(obstacles).toEqual(obstaclesOf(nodes, 1, 2));
    expect(obstacles).toHaveLength(MAX_OBSTACLES + 1);
    expect(obstacles.at(-1)).toEqual(labelBoxOf(at(nodes, 0)));
  });

  it("COMPILE.MODULE: the module of avoid gives the route of ireko with the same bits", () => {
    fc.assert(
      fc.property(routerEdge(8), (edge) => {
        expect(avoidValue(modules.avoid, edge)).toEqual(avoid(edge));
      }),
    );
  });

  it("COMPILE.MODULE: the module of avoid gives the route of ireko for boxes on a lattice, where the ties of the heap decide", () => {
    fc.assert(
      fc.property(routerEdge(10, routeLattice), (edge) => {
        expect(avoidValue(modules.avoid, edge)).toEqual(avoid(edge));
      }),
      { numRuns: 400 },
    );
  });

  it("COMPILE.MODULE: the module of avoid gives one route at each box", () => {
    const edge = at(FIXED, 0)[1];
    const { vars } = avoidRun(edge);
    const values = modules.avoid(avoidRecords(edge), vars);
    expect(values).toHaveLength(3);
    expect(new Set(values.map((value) => JSON.stringify(value))).size).toBe(1);
  });

  it("COMPILE.TIERED: the program of avoid gives the route of ireko in the interpreter and in tier 2", () => {
    fc.assert(
      fc.property(routerEdge(2), (edge) => {
        const { space: boxes, vars } = avoidRun(edge);
        const expected = avoid(edge);
        expect(runAt(programs.avoid.interpreted, boxes, "0", vars)).toEqual(expected);
        expect(runAt(programs.avoid.generated, boxes, "0", vars)).toEqual(expected);
      }),
      { numRuns: 8 },
    );
  });

  it.each(FIXED)("the fixed case %s gives the points of the routers of ireko", (_, edge, straightPoints, orthogonalPoints, avoidPoints) => {
    const records = routerRecords([edge]);
    expect(modules.straight(records, {})).toEqual([straightPoints]);
    expect(modules.orthogonal(records, {})).toEqual([orthogonalPoints]);
    expect(avoidValue(modules.avoid, edge)).toEqual(avoidPoints);
    const { space: boxes, vars } = avoidRun(edge);
    expect(runAt(programs.avoid.interpreted, boxes, "0", vars)).toEqual(avoidPoints);
    expect(runAt(programs.avoid.generated, boxes, "0", vars)).toEqual(avoidPoints);
    // The hand copy is the oracle of the properties, so it must agree with the values of ireko too.
    expect([straight(edge), orthogonal(edge), avoid(edge)]).toEqual([straightPoints, orthogonalPoints, avoidPoints]);
  });

  it.each(DECIDED)("the fixed case %s gives the route of ireko", (_, edge, points) => {
    expect(avoidValue(modules.avoid, edge)).toEqual(points);
    expect(avoid(edge)).toEqual(points);
  });

  it("a difference: a ratio of borderPoint that overflows gives an error, where ireko keeps the other ratio", () => {
    const edge: RouterEdge = { source: r(-5, 0, 10, 10), target: r(1e-320, 100, 0, 10) };
    expect(straight(edge).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    const s = space.array(routerRecords([edge]));
    const result = programs.straight.interpreted.run({ space: s, origin: "0" });
    expect(result.ok).toBe(false);
    expect(programs.straight.generated.run({ space: s, origin: "0" })).toEqual(result);
    expect(Array.isArray(at(modules.straight(s.records, {}), 0))).toBe(false);
  });

  it("a difference: a box that is not finite gives an error, and ireko gives its check of the route such a value", () => {
    const edge: RouterEdge = { source: r(0, 0, Number.POSITIVE_INFINITY, 50), target: TARGET, obstacles: [] };
    expect(straight(edge).some((p) => !Number.isFinite(p.x))).toBe(true);
    const s = space.array(routerRecords([edge]));
    expect(programs.straight.interpreted.run({ space: s, origin: "0" }).ok).toBe(false);
    expect(Array.isArray(avoidValue(modules.avoid, edge))).toBe(false);
  });

  it("a difference: a grid of more than 50000 points gives an error, and ireko has no limit", () => {
    const stair = Array.from({ length: 115 }, (_, i) => r(1000 + 7 * i, 1000 + 7 * i, 3, 3));
    const edge: RouterEdge = { source: SOURCE, target: TARGET, obstacles: stair };
    expect(avoid(edge).length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(avoidValue(modules.avoid, edge))).toBe(false);
  });
});
