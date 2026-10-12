import type { Result } from "@mark1russell7/vex";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOM_COLUMNS, bomFormula, bomReference, bomVex, type Part } from "./bom.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** A random product: each part after the first has an earlier part as its parent, or it is another top assembly. */
const product: fc.Arbitrary<Part[]> = fc
  .array(fc.record({ parent: fc.nat(), top: fc.boolean(), qty: fc.integer({ min: 1, max: 6 }), cost: fc.integer({ min: 0, max: 10000 }).map((n) => n / 100) }), { minLength: 1, maxLength: 14 })
  .map((rows) => rows.map((r, i) => ({ id: `p${i}`, qty: r.qty, cost: r.cost, ...(i === 0 || r.top ? {} : { parent: `p${r.parent % i}` }) })));

describe("the bill of materials pilot", () => {
  // bike (labor 100) ─┬─ wheel ×2 (20) ─┬─ spoke ×32 (0.25)
  //                   │                 └─ tube ×1 (5)
  //                   └─ seat ×1 (15)
  const bike: Part[] = [
    { id: "bike", qty: 1, cost: 100 },
    { id: "wheel", parent: "bike", qty: 2, cost: 20 },
    { id: "spoke", parent: "wheel", qty: 32, cost: 0.25 },
    { id: "tube", parent: "wheel", qty: 1, cost: 5 },
    { id: "seat", parent: "bike", qty: 1, cost: 15 },
  ];

  it("gives the hand-checked costs and counts of a bike", () => {
    // wheel: 20 + 32 x 0.25 + 1 x 5 = 33. bike: 100 + 2 x 33 + 1 x 15 = 181.
    // need: spokes 2 x 32 = 64, tubes 2, seat 1. leafUnits of the bike: 64 + 2 + 1 = 67.
    const expected: Record<string, [number, number, number]> = { bike: [181, 1, 67], wheel: [33, 2, 33], spoke: [0.25, 64, 1], tube: [5, 2, 1], seat: [15, 1, 1] };
    const ref = bomReference(bike);
    for (const cells of [bomVex(bike), bomFormula(bike)]) {
      for (const [id, values] of Object.entries(expected)) {
        expect(BOM_COLUMNS.map((c) => plain(cells(id, c)))).toEqual(values);
        expect(BOM_COLUMNS.map((c) => ref.get(id)?.[c])).toEqual(values);
      }
    }
  });

  it("gives the same costs and counts with the builder, the formulas and the reference, for random products", () => {
    fc.assert(
      fc.property(product, (parts) => {
        const ref = bomReference(parts);
        const vexCells = bomVex(parts);
        const formulaCells = bomFormula(parts);
        for (const p of parts) {
          for (const c of BOM_COLUMNS) {
            const v = vexCells(p.id, c);
            expect(v).toEqual(formulaCells(p.id, c));
            expect(plain(v)).toBe(ref.get(p.id)?.[c]);
          }
        }
      }),
    );
  });

  it("gives an error value with a reason for a part without a quantity, and the cost of the parent is an error too", () => {
    const broken = bike.map((p) => (p.id === "tube" ? ({ id: "tube", parent: "wheel", cost: 5 } as unknown as Part) : p));
    for (const cells of [bomVex(broken), bomFormula(broken)]) {
      const wheel = cells("wheel", "rolled");
      expect(wheel.ok ? "a value" : wheel.error.code).toBe("#N/A");
      expect(wheel.ok ? "" : wheel.error.message).toMatch(/qty/);
      expect(plain(cells("bike", "rolled"))).toBe("#N/A");
      expect(plain(cells("seat", "rolled"))).toBe(15);
    }
  });
});
