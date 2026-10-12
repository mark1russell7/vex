import { Vec2 } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { auditReference, auditVex, checkResults, explainCheck, overlapsReference, overlapsVex, placedReference, placedVex, type AuditOptions, type LayoutBox } from "./layout-audit.ts";

const box = (id: string, x: number, y: number, w: number, h: number, parent?: string, radial?: boolean): LayoutBox => ({
  id,
  position: new Vec2(x, y),
  size: new Vec2(w, h),
  ...(parent === undefined ? {} : { parent }),
  ...(radial === undefined ? {} : { radial }),
});

// The output of the Jqy engine (commit 8848753) for a nested radial tree, with the spacing 16 and the default tuning.
const JQY_SNAPSHOT: readonly LayoutBox[] = [
  box("app", 0, 0, 242, 242, undefined, true),
  box("api", 162, 95, 52, 52, "app", true),
  box("auth", 192, 117, 8, 8, "api"),
  box("users", 180, 124, 8, 8, "api"),
  box("billing", 180, 110, 8, 8, "api"),
  box("web", 105, 148, 73, 73, "app"),
  box("jobs", 31, 124, 73, 73, "app"),
  box("db", 31, 45, 73, 73, "app"),
  box("cache", 105, 21, 73, 73, "app"),
];
const JQY_TUNING: AuditOptions = { pad: 16, gap: 4, minRadius: 8 };

/** A random layout: each box after the first has an earlier box as its parent, or no parent. */
const layout: fc.Arbitrary<LayoutBox[]> = fc
  .array(
    fc.record({
      x: fc.integer({ min: 0, max: 300 }),
      y: fc.integer({ min: 0, max: 300 }),
      w: fc.integer({ min: 1, max: 160 }),
      h: fc.integer({ min: 1, max: 160 }),
      parent: fc.nat(),
      orphan: fc.boolean(),
      radial: fc.boolean(),
      snap: fc.boolean(),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((rows) => {
    const boxes: LayoutBox[] = rows.map((r, i) => box(`b${i}`, r.x, r.y, r.w, r.h, i === 0 || r.orphan ? undefined : `b${r.parent % i}`, r.radial));
    // Half of the children of a radial parent go to their place on the ring, so the ring check sees both outcomes.
    rows.forEach((r, i) => {
      const b = boxes[i];
      if (!r.snap || b?.parent === undefined) return;
      const placed = placedReference(boxes, JQY_TUNING).get(b.id);
      if (placed !== undefined) boxes[i] = { ...b, position: placed.subtract(b.size.halve()) };
    });
    return boxes;
  });

describe("the layout audit pilot (Jqy)", () => {
  it("gives the three findings of the Jqy audit for the Jqy snapshot", () => {
    const expected = ["auth", "billing", "users"].map((child) => ({ code: "NESTED_CHILD_OUTSIDE_PARENT", child }));
    expect(auditReference(JQY_SNAPSHOT, JQY_TUNING)).toEqual(expected);
    expect(auditVex(JQY_SNAPSHOT, JQY_TUNING)).toEqual(expected);
  });

  it("places the children of the Jqy snapshot on the ring within one pixel, because Jqy rounds the positions", () => {
    const placed = placedVex(JQY_SNAPSHOT, JQY_TUNING);
    for (const b of JQY_SNAPSHOT.filter((x) => x.parent !== undefined)) {
      const p = placed.get(b.id);
      expect(p?.ok === true && p.value instanceof Vec2 ? p.value.distance(b.position.add(b.size.halve())) : Infinity).toBeLessThan(1);
    }
    expect(placed.get("app")?.ok).toBe(false);
  });

  it("explains a finding: the box auth ends 2 px after the inner edge of its parent", () => {
    expect(checkResults(JQY_SNAPSHOT, JQY_TUNING)["auth"]?.NESTED_CHILD_OUTSIDE_PARENT).toEqual({ ok: true, value: true });
    const steps = explainCheck(JQY_SNAPSHOT, JQY_TUNING, "NESTED_CHILD_OUTSIDE_PARENT", "auth").events.map((e) => [e.label, e.result.ok ? String(e.result.value) : e.result.error.code]);
    expect(steps).toContainEqual(["subtract", "(-2, 6)"]);
  });

  it("gives the same findings as the reference for random layouts", () => {
    fc.assert(
      fc.property(layout, (boxes) => {
        expect(auditVex(boxes, JQY_TUNING)).toEqual(auditReference(boxes, JQY_TUNING));
      }),
    );
  });

  it("places each child of a radial parent where the reference places it", () => {
    fc.assert(
      fc.property(layout, (boxes) => {
        const placed = placedVex(boxes, JQY_TUNING);
        for (const [id, expected] of placedReference(boxes, JQY_TUNING)) {
          const r = placed.get(id);
          expect(r?.ok === true && r.value instanceof Vec2 ? r.value.distance(expected) : Infinity).toBeLessThan(1e-9);
        }
      }),
    );
  });

  it("gives the same overlapping pairs as the reference for random boxes", () => {
    fc.assert(
      fc.property(layout, (boxes) => {
        expect(overlapsVex(boxes)).toEqual(overlapsReference(boxes));
      }),
    );
  });
});
