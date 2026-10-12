/**
 * The flock pilot: the steering of each bird of a flock (boids). Each bird looks at the other birds near it.
 * Separation steers away from the birds that are too close. Alignment steers to the mean velocity of the near birds.
 * Cohesion steers to the mean position of the near birds. The steering is the weighted sum of the three vectors.
 *
 * The Vex program uses the others axis with `where`, distances, and means of `Vec2` values. A list of vectors has no
 * `mean()`, so a mean is `reduce("add")` divided by `count()`. A bird with no near birds gets the zero vector.
 */
import { space, vex } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

/** A bird: its position and its velocity. */
export interface Bird {
  readonly position: Vec2;
  readonly velocity: Vec2;
}

/** The tuning: the radius of sight, the radius of separation, and the weight of each rule. */
export interface FlockOptions {
  readonly radius: number;
  readonly separation: number;
  readonly separate: number;
  readonly align: number;
  readonly cohere: number;
}

/** This function gives the steering vector of each bird, with one Vex program. */
export function steerVex(birds: Readonly<Record<string, Bird>>, o: FlockOptions): Record<string, Vec2> {
  // Vec2Domain comes first, so the empty sum of vectors is the zero vector (refer to the empty-reduce finding).
  const root = vex(Vec2Domain, NumDomain, BoolDomain).over(space.record(birds));
  const near = root.start(0).others((e) => e, { where: (e) => e.from("position")._.distance(e.origin().from("position"))._.lt(o.radius) });
  const count = near.count();
  const separate = root
    .start(0)
    .others((e) => e.origin().from("position")._.subtract(e.from("position")), { where: (e) => e.from("position")._.distance(e.origin().from("position"))._.lt(o.separation) })
    .reduce("add");
  const meanOf = (field: "position" | "velocity") =>
    root
      .start(0)
      .others((e) => e.from(field), { where: (e) => e.from("position")._.distance(e.origin().from("position"))._.lt(o.radius) })
      .reduce("add")
      ._.divide(count);
  // With no near birds, the mean divides by 0 and gives #NUM!. Then the rule gives the zero vector.
  const align = meanOf("velocity")._.subtract("velocity").ifError(Vec2.zero);
  const cohere = meanOf("position")._.subtract("position").ifError(Vec2.zero);
  const steer = separate._.scale(o.separate)._.add(align._.scale(o.align))._.add(cohere._.scale(o.cohere));
  const out: Record<string, Vec2> = {};
  for (const k of Object.keys(birds)) {
    const r = steer.result(k);
    if (!r.ok || !(r.value instanceof Vec2)) throw new Error(`the bird ${k} gave ${r.ok ? typeof r.value : r.error.code}`);
    out[k] = r.value;
  }
  return out;
}

/** This function gives the steering vector of each bird, in plain TypeScript. */
export function steerReference(birds: Readonly<Record<string, Bird>>, o: FlockOptions): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  const all = Object.entries(birds);
  for (const [k, b] of all) {
    let sep = Vec2.zero;
    let vel = Vec2.zero;
    let pos = Vec2.zero;
    let n = 0;
    for (const [j, other] of all) {
      if (j === k) continue;
      // The same arithmetic as the Vex program: the distance from the other bird to this bird.
      const d = Math.hypot(other.position.x - b.position.x, other.position.y - b.position.y);
      if (d < o.separation) sep = sep.add(b.position.subtract(other.position));
      if (d < o.radius) {
        vel = vel.add(other.velocity);
        pos = pos.add(other.position);
        n++;
      }
    }
    const align = n === 0 ? Vec2.zero : vel.scale(1 / n).subtract(b.velocity);
    const cohere = n === 0 ? Vec2.zero : pos.scale(1 / n).subtract(b.position);
    out[k] = sep.scale(o.separate).add(align.scale(o.align)).add(cohere.scale(o.cohere));
  }
  return out;
}
