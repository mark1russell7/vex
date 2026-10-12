import type { Result } from "@mark1russell7/vex";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GRADE_COLUMNS, gradeFormula, gradeReference, gradeVex, studentKey, type SchoolClass } from "./grades.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** Random classes with unique names and scores from 0 to 100, so ties are common. */
const school: fc.Arbitrary<SchoolClass[]> = fc
  .array(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 4 })
  .map((classes) => classes.map((scores, i) => ({ name: `class${i}`, students: scores.map((score, j) => ({ name: `s${j}`, score })) })));

describe("the grade book pilot", () => {
  const classes: SchoolClass[] = [
    { name: "maths", students: [{ name: "ada", score: 94 }, { name: "bo", score: 81 }, { name: "cy", score: 81 }] },
    { name: "art", students: [{ name: "di", score: 70 }, { name: "ed", score: 90 }] },
  ];

  it("gives the hand-checked mean, rank and comparison of each student", () => {
    // maths: (94 + 81 + 81) / 3 = 85.333..., ranks 1, 2, 2. art: (70 + 90) / 2 = 80, ranks 2, 1.
    const expected: Record<string, [number, number, boolean]> = {
      "maths/ada": [256 / 3, 1, true],
      "maths/bo": [256 / 3, 2, false],
      "maths/cy": [256 / 3, 2, false],
      "art/di": [80, 2, false],
      "art/ed": [80, 1, true],
    };
    for (const cells of [gradeVex(classes), gradeFormula(classes)]) {
      for (const [key, values] of Object.entries(expected)) expect(GRADE_COLUMNS.map((c) => plain(cells(key, c)))).toEqual(values);
    }
    const ref = gradeReference(classes);
    for (const [key, values] of Object.entries(expected)) expect(GRADE_COLUMNS.map((c) => ref.get(key)?.[c])).toEqual(values);
  });

  it("gives an error value at a class row, the same with the builder and the formulas", () => {
    const vexCells = gradeVex(classes);
    const formulaCells = gradeFormula(classes);
    for (const c of GRADE_COLUMNS) {
      const v = vexCells("maths", c);
      expect(v.ok).toBe(false);
      expect(plain(v)).toBe(plain(formulaCells("maths", c)));
    }
  });

  it("gives the same mean, rank and comparison with the builder, the formulas and the reference, for random classes", () => {
    fc.assert(
      fc.property(school, (classes2) => {
        const ref = gradeReference(classes2);
        const vexCells = gradeVex(classes2);
        const formulaCells = gradeFormula(classes2);
        for (const c of classes2) {
          for (const s of c.students) {
            const key = studentKey(c.name, s.name);
            for (const col of GRADE_COLUMNS) {
              const v = vexCells(key, col);
              expect(v).toEqual(formulaCells(key, col));
              expect(plain(v)).toBe(ref.get(key)?.[col]);
            }
          }
        }
      }),
    );
  });
});
