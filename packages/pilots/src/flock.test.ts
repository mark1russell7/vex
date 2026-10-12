import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { steerReference, steerVex, type Bird, type FlockOptions } from "./flock.ts";

const bird = (x: number, y: number, vx: number, vy: number): Bird => ({ position: new Vec2(x, y), velocity: new Vec2(vx, vy) });
const ONE: FlockOptions = { radius: 5, separation: 3, separate: 1, align: 1, cohere: 1 };

const coord = fc.integer({ min: -20, max: 20 });
const flock: fc.Arbitrary<Record<string, Bird>> = fc
  .array(fc.tuple(coord, coord, fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 })), { minLength: 1, maxLength: 8 })
  .map((rows) => Object.fromEntries(rows.map(([x, y, vx, vy], i) => [`b${i}`, bird(x, y, vx, vy)])));
const options: fc.Arbitrary<FlockOptions> = fc.record({
  radius: fc.integer({ min: 1, max: 15 }),
  separation: fc.double({ min: 0.5, max: 6, noNaN: true }),
  separate: fc.double({ min: 0, max: 2, noNaN: true }),
  align: fc.double({ min: 0, max: 2, noNaN: true }),
  cohere: fc.double({ min: 0, max: 2, noNaN: true }),
});

describe("the flock pilot", () => {
  it("steers three birds: the values checked by hand", () => {
    const birds = { A: bird(0, 0, 1, 0), B: bird(2, 0, 0, 1), C: bird(100, 100, 0, 0) };
    // A sees B: separation A - B = (-2, 0), alignment (0, 1) - (1, 0) = (-1, 1), cohesion (2, 0) - (0, 0) = (2, 0).
    expect(steerVex(birds, ONE)).toEqual({ A: new Vec2(-1, 1), B: new Vec2(1, -1), C: Vec2.zero });
    expect(steerReference(birds, ONE)).toEqual(steerVex(birds, ONE));
  });

  it("gives the steering of the reference for random flocks and tunings", () => {
    fc.assert(
      fc.property(flock, options, (birds, o) => {
        const got = steerVex(birds, o);
        const want = steerReference(birds, o);
        for (const k of Object.keys(birds)) expect((got[k] ?? Vec2.zero).distance(want[k] ?? Vec2.zero)).toBeLessThan(1e-9);
      }),
    );
  });

  // V-NEXT-empty-reduce: an empty reduce takes the identity of the first domain with the op, not of the values.
  // With NumDomain first, the empty sum of vectors is the number 0, so the typed chain gets a value of another type.
  // The fix needs a decision about the semantics of LIST.EMPTY, so this test is it.fails until that decision.
  it.fails("V-NEXT-empty-reduce: the empty sum of a list of vectors is a vector, whatever the order of the domains", () => {
    const root = vex(NumDomain, Vec2Domain).over(space.record({ A: { p: new Vec2(1, 2) } }));
    const sum = root.start(0).others((e) => e.from("p")).reduce("add");
    // The static type of the chain is Vec2. The value is the number 0.
    expect(sum.result("A")).toEqual({ ok: true, value: Vec2.zero });
  });
});
