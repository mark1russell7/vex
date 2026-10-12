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

  // V-049: an empty reduce took the identity of the first domain with the op, not of the values. With NumDomain
  // first, the empty sum of vectors was the number 0, a value of another type than the chain.
  it("LIST.EMPTY V-049: an empty reduce gives #N/A when two domains have an identity, and { domain } names one", () => {
    const root = vex(NumDomain, Vec2Domain).over(space.record({ A: { p: new Vec2(1, 2) } }));
    const sum = root.start(0).others((e) => e.from("p"));
    const unclear = sum.reduce("add").result("A");
    expect(unclear.ok ? unclear.value : [unclear.error.code, unclear.error.message]).toEqual(["#N/A", '"reduce" with "add" has no values, and more domains have an identity for it (Num, Vec2). Name one with { domain }']);
    expect(sum.reduce("add", { domain: "Vec2" }).result("A")).toEqual({ ok: true, value: Vec2.zero });
    expect(sum.reduce("add", { domain: "Num" }).result("A")).toEqual({ ok: true, value: 0 });
    // With one domain that has an identity, the empty list needs no option.
    expect(vex(Vec2Domain).over(space.record({ A: { p: new Vec2(1, 2) } })).start(0).others((e) => e.from("p")).reduce("add").result("A")).toEqual({ ok: true, value: Vec2.zero });
  });
});
