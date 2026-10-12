/**
 * The bill of materials pilot. A product is a tree of parts. Each part has a quantity (the number of this part in one
 * unit of its parent) and a unit cost. This module gives three columns three times: with the typed builder, with the
 * formula language, and in plain TypeScript.
 *
 * - `rolled`: the cost of one unit of the part with its parts: its own cost plus the quantity times the rolled-up
 *   cost of each child.
 * - `need`: the number of units of the part in one unit of its top assembly.
 * - `leafUnits`: the number of leaf parts in one unit of the part.
 */
import { parent, space, vex, type Space } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import { runFormulas, type FormulaCells } from "./formula-run.ts";

/** A part of a product. A part without a parent is a top assembly. A parent comes before its children. */
export interface Part {
  readonly id: string;
  readonly parent?: string;
  readonly qty: number;
  readonly cost: number;
}

/** The computed columns. */
export const BOM_COLUMNS: readonly ["rolled", "need", "leafUnits"] = ["rolled", "need", "leafUnits"];

/** The record of a part in the tree space. */
export interface PartRecord {
  readonly qty: number;
  readonly cost: number;
}

/** This function gives the tree space of the parts. */
export function bomSpace(parts: readonly Part[]): Space<string, PartRecord> {
  const records: Record<string, PartRecord> = {};
  const parents: Record<string, string | null> = {};
  for (const p of parts) {
    records[p.id] = { qty: p.qty, cost: p.cost };
    parents[p.id] = p.parent ?? null;
  }
  return space.tree(records, parents);
}

/** The columns in plain TypeScript. */
export function bomReference(parts: readonly Part[]): Map<string, { readonly rolled: number; readonly need: number; readonly leafUnits: number }> {
  const kids = (id: string): Part[] => parts.filter((p) => p.parent === id);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const rolled = (p: Part): number => p.cost + kids(p.id).reduce((s, c) => s + c.qty * rolled(c), 0);
  const need = (p: Part): number => {
    const up = p.parent === undefined ? undefined : byId.get(p.parent);
    return up === undefined ? 1 : p.qty * need(up);
  };
  const leafUnits = (p: Part): number => {
    const k = kids(p.id);
    return k.length === 0 ? 1 : k.reduce((s, c) => s + c.qty * leafUnits(c), 0);
  };
  return new Map(parts.map((p) => [p.id, { rolled: rolled(p), need: need(p), leafUnits: leafUnits(p) }]));
}

/**
 * The columns with the typed builder. The builder has no member for the form `if`, so `need` uses `ifError` at a root
 * (the parent of a root is `#REF!`), and `leafUnits` uses `max(1)`. Both are correct only for quantities of 1 or more.
 */
export function bomVex(parts: readonly Part[]): FormulaCells {
  const root = vex(NumDomain, BoolDomain, TextDomain, Vec2Domain, ColorDomain, AngleDomain).over(bomSpace(parts));
  const s = root
    .sheet()
    .declare<{ rolled: number; need: number; leafUnits: number }>()
    .column("rolled", (r) => r.from("cost")._.add(r.start(0).children((c) => c.from("qty")._.multiply(r.cell("rolled"))).sum({ strict: true })))
    .column("need", (r) => r.from("qty")._.multiply(r.cell("need", [parent])).ifError(1))
    .column("leafUnits", (r) => r.start(0).children((c) => c.from("qty")._.multiply(r.cell("leafUnits"))).sum({ strict: true })._.max(1));
  return (key, column) => s.result(key, column as "rolled");
}

/** The formulas of the columns, in the formula language. */
export const BOM_FORMULAS: Readonly<Record<(typeof BOM_COLUMNS)[number], string>> = {
  rolled: "= cost + SUM(children, qty * rolled)",
  need: "= IF(COUNT(ancestors) = 0, 1, qty * parent.need)",
  leafUnits: "= IF(COUNT(children) = 0, 1, SUM(children, qty * leafUnits))",
};

/** The columns with the formula language. */
export function bomFormula(parts: readonly Part[]): FormulaCells {
  return runFormulas(bomSpace(parts), ["qty", "cost"], BOM_FORMULAS);
}
