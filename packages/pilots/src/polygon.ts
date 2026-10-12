/**
 * The polygon pilot: the area, the perimeter and the centroid of a polygon with the shoelace formula. The vertices are
 * an array space. The edge of each vertex goes to the next vertex with `offset(1)`. The last vertex has no next
 * vertex, so `ifError` goes back to the first vertex with `index(0)`.
 *
 * The area has a sign: positive for counterclockwise vertices (with the y axis up), negative for clockwise vertices.
 */
import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

/** The measures of a polygon. The centroid is `undefined` for a polygon with no area. */
export interface PolygonMeasures {
  readonly area: number;
  readonly perimeter: number;
  readonly centroid: Vec2 | undefined;
}

/** This function gives the measures of a polygon with Vex. The polygon needs one vertex or more. */
export function measureVex(vertices: readonly Vec2[]): PolygonMeasures {
  const root = vex(Vec2Domain, NumDomain).over(space.array(vertices.map((p) => ({ p }))));
  type At = Parameters<Parameters<ReturnType<typeof root.start>["each"]>[0]>[0];
  // The next vertex: offset(1), or the first vertex after the last one.
  const next = (c: At) => c.offset(1).from("p").ifError(c.index(0).from("p"));
  const area = root.start(0).each((c) => c.from("p")._.cross(next(c))).sum()._.multiply(0.5);
  const perimeter = root.start(0).each((c) => c.from("p")._.distance(next(c))).sum();
  const centroid = root
    .start(0)
    .each((c) => c.from("p")._.add(next(c))._.scale(c.from("p")._.cross(next(c))))
    .reduce("add")
    ._.divide(area._.multiply(6));
  const number = (r: ReturnType<typeof area.result>): number => {
    if (!r.ok) throw new Error(`the polygon gave ${r.error.code}`);
    return r.value;
  };
  const c = centroid.result("0");
  return { area: number(area.result("0")), perimeter: number(perimeter.result("0")), centroid: c.ok ? c.value : undefined };
}

/** This function gives the measures of a polygon in plain TypeScript. */
export function measureReference(vertices: readonly Vec2[]): PolygonMeasures {
  let twice = 0;
  let perimeter = 0;
  let cx = 0;
  let cy = 0;
  vertices.forEach((p, i) => {
    const q = vertices[(i + 1) % vertices.length] ?? p;
    const cross = p.x * q.y - p.y * q.x;
    twice += cross;
    perimeter += Math.hypot(p.x - q.x, p.y - q.y);
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  });
  const area = twice / 2;
  return { area, perimeter, centroid: area === 0 ? undefined : new Vec2(cx / (6 * area), cy / (6 * area)) };
}
