/**
 * The grade book pilot. A school has classes, and a class has students: a tree with a class at each root and the
 * students as its children. This module gives three columns of each student three times: with the typed builder, with
 * the formula language, and in plain TypeScript.
 *
 * - `classMean`: the mean score of the class of the student (the children of the parent).
 * - `rank`: 1 plus the number of other students of the class with a larger score.
 * - `above`: `true` if the score of the student is above the mean of the class.
 */
import { space, vex, type Space } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import { runFormulas, type FormulaCells } from "./formula-run.ts";

/** A class and its students. */
export interface SchoolClass {
  readonly name: string;
  readonly students: readonly { readonly name: string; readonly score: number }[];
}

/** The computed columns. */
export const GRADE_COLUMNS: readonly ["classMean", "rank", "above"] = ["classMean", "rank", "above"];

/**
 * The record of a row. A class row has no score. The builder needs one record type for both kinds of rows. Thus the
 * type gives a score to each row, and a class row gives `#N/A` when a formula reads its score.
 */
export interface GradeRecord {
  readonly name: string;
  readonly score: number;
}

/** The key of a student: the class name and the student name. */
export const studentKey = (c: string, s: string): string => `${c}/${s}`;

/** This function gives the tree space of the classes: one root for each class, with its students as children. */
export function gradeSpace(classes: readonly SchoolClass[]): Space<string, GradeRecord> {
  const records: Record<string, GradeRecord> = {};
  const parents: Record<string, string | null> = {};
  for (const c of classes) {
    records[c.name] = { name: c.name } as GradeRecord;
    parents[c.name] = null;
    for (const s of c.students) {
      records[studentKey(c.name, s.name)] = { name: s.name, score: s.score };
      parents[studentKey(c.name, s.name)] = c.name;
    }
  }
  return space.tree(records, parents);
}

/** The columns of each student, in plain TypeScript. */
export function gradeReference(classes: readonly SchoolClass[]): Map<string, { readonly classMean: number; readonly rank: number; readonly above: boolean }> {
  const out = new Map<string, { classMean: number; rank: number; above: boolean }>();
  for (const c of classes) {
    const mean = c.students.reduce((sum, s) => sum + s.score, 0) / c.students.length;
    for (const s of c.students) {
      const rank = 1 + c.students.filter((o) => o !== s && o.score > s.score).length;
      out.set(studentKey(c.name, s.name), { classMean: mean, rank, above: s.score > mean });
    }
  }
  return out;
}

/** The columns with the typed builder. The class of a student is `parent().children()` (spec BUILD.AXIS.ADDRESS). */
export function gradeVex(classes: readonly SchoolClass[]): FormulaCells {
  const root = vex(NumDomain, BoolDomain, TextDomain, Vec2Domain, ColorDomain, AngleDomain).over(gradeSpace(classes));
  const s = root
    .sheet()
    .column("classMean", (r) => r.start(0).parent().children((c) => c.from("score")).mean({ strict: true }))
    .column("rank", (r) => r.start(0).siblings((o) => o, { where: (o) => o.from("score")._.gt(o.origin().from("score")) }).count({ strict: true })._.add(1))
    .column("above", (r) => r.from("score")._.gt(r.cell("classMean")));
  return (key, column) => s.result(key, column as "rank");
}

/** The formulas of the columns, in the formula language. */
export const GRADE_FORMULAS: Readonly<Record<(typeof GRADE_COLUMNS)[number], string>> = {
  classMean: "= AVERAGE(parent.children.score)",
  rank: "= 1 + COUNT(siblings WHERE score > this.score)",
  above: "= score > classMean",
};

/** The columns with the formula language. */
export function gradeFormula(classes: readonly SchoolClass[]): FormulaCells {
  return runFormulas(gradeSpace(classes), ["name", "score"], GRADE_FORMULAS);
}
