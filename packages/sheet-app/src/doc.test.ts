import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addColumn, addRow, cellFormulaOf, cellTextOf, columnLetter, convertColumn, deleteColumn, deleteRow, depthOf, emptyDoc, emptyGrid, freeLetter, indentRow, isSheetDoc, moveColumn, moveRow, outdentRow, setCell, setCellFormula, setCellText, subtree, uniqueNames, updateColumn, type SheetDoc } from "./doc.ts";
import { EXAMPLES } from "./examples.ts";

const shape = (d: SheetDoc): string[] => d.rows.map((r) => `${"  ".repeat(depthOf(d, r.id))}${r.id}`);

/** A document with the tree a(b(c), d), e. */
function sample(): SheetDoc {
  let d = emptyDoc();
  d = { ...d, rows: [] };
  const add = (after?: string, child = false): string => {
    const r = addRow(d, after, child);
    d = r.doc;
    return r.id;
  };
  const a = add();
  const b = add(a, true);
  add(b, true);
  add(b);
  add(a);
  return d;
}

/** This function gives the names that `uniqueNames` gives to columns with the names `ns`. */
const uniqueOf = (ns: readonly string[]): string[] => uniqueNames(ns.map((name) => ({ name }))).map((c) => c.name);

describe("the document", () => {
  it("gives a duplicate column a name that no column has, and keeps each first name", () => {
    expect(uniqueOf(["a", "a", "a 2"])).toEqual(["a", "a 3", "a 2"]);
    expect(uniqueOf(["a", "A", "a"])).toEqual(["a", "A 2", "a 3"]);
    expect(uniqueOf(["x", "y"])).toEqual(["x", "y"]);
    fc.assert(
      fc.property(fc.array(fc.constantFrom("a", "A", "a 2", "a 3", "b"), { maxLength: 8 }), (ns) => {
        const out = uniqueOf(ns);
        expect(new Set(out.map((n) => n.toLowerCase())).size).toBe(out.length);
        // A column keeps its name when no earlier column has it.
        const firsts = ns.flatMap((n, i) => (ns.slice(0, i).some((m) => m.toLowerCase() === n.toLowerCase()) ? [] : [i]));
        expect(firsts.map((i) => out[i])).toEqual(firsts.map((i) => ns[i]));
      }),
    );
  });

  it("adds rows as siblings or children, after the block of a row", () => {
    expect(shape(sample())).toEqual(["r1", "  r2", "    r3", "  r4", "r5"]);
    expect(subtree(sample(), "r2")).toEqual(["r2", "r3"]);
    expect(shape(addRow(sample(), "r2").doc)).toEqual(["r1", "  r2", "    r3", "  r6", "  r4", "r5"]);
  });

  it("deletes a row with its block", () => {
    expect(shape(deleteRow(sample(), "r2"))).toEqual(["r1", "  r4", "r5"]);
  });

  it("indents a row under its previous sibling, and outdents it after the block of its parent", () => {
    expect(shape(indentRow(sample(), "r4"))).toEqual(["r1", "  r2", "    r3", "    r4", "r5"]);
    expect(indentRow(sample(), "r1")).toEqual(sample());
    expect(shape(outdentRow(sample(), "r2"))).toEqual(["r1", "  r4", "r2", "  r3", "r5"]);
    expect(outdentRow(sample(), "r1")).toEqual(sample());
  });

  it("moves the block of a row before or after a sibling", () => {
    expect(shape(moveRow(sample(), "r4", -1))).toEqual(["r1", "  r4", "  r2", "    r3", "r5"]);
    expect(shape(moveRow(sample(), "r1", 1))).toEqual(["r5", "r1", "  r2", "    r3", "  r4"]);
    expect(moveRow(sample(), "r5", 1)).toEqual(sample());
  });

  it("keeps a valid document after any sequence of row operations", () => {
    const op = fc.tuple(fc.constantFrom("add", "child", "delete", "indent", "outdent", "up", "down"), fc.nat());
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        let d = sample();
        for (const [kind, n] of ops) {
          const id = d.rows[n % Math.max(1, d.rows.length)]?.id;
          if (id === undefined) d = addRow(d).doc;
          else if (kind === "add") d = addRow(d, id).doc;
          else if (kind === "child") d = addRow(d, id, true).doc;
          else if (kind === "delete") d = deleteRow(d, id);
          else if (kind === "indent") d = indentRow(d, id);
          else if (kind === "outdent") d = outdentRow(d, id);
          else d = moveRow(d, id, kind === "up" ? -1 : 1);
          expect(isSheetDoc(d)).toBe(true);
        }
      }),
    );
  });

  it("changes columns: unique names, conversion, deletion and order", () => {
    let d = emptyDoc();
    d = addColumn(d, { name: "item", kind: "value", type: "text" }).doc;
    expect(d.columns.map((c) => c.name)).toEqual(["Item", "Amount", "item 2"]);
    expect(updateColumn(d, "c1", { name: "amount" }).columns[0]?.name).toBe("Item");
    expect(updateColumn(d, "c1", { name: " Label " }).columns[0]?.name).toBe("Label");
    expect(convertColumn(d, "c2").columns[1]).toEqual({ id: "c2", name: "Amount", kind: "formula", formula: "" });
    d = setCell(d, "r1", "c2", "5");
    expect(deleteColumn(d, "c2").rows[0]?.cells).toEqual({});
    expect(moveColumn(d, "c1", 1).columns.map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
    expect(moveColumn(d, "c1", -1)).toBe(d);
  });

  it("SHEET.CELL.FORMULA: a cell can have its own formula, and a deleted column takes the formulas of its cells with it", () => {
    const base = emptyDoc();
    let d: SheetDoc = { ...base, columns: [...base.columns, { id: "c3", name: "Twice", kind: "formula", formula: "= Amount * 2" }] };
    d = setCellFormula(setCellFormula(d, "r1", "c3", "= 5"), "r1", "c2", "= 1");
    expect(d.rows[0]?.formulas).toEqual({ c3: "= 5", c2: "= 1" });
    expect([cellFormulaOf(d, "r1", "c3"), cellFormulaOf(d, "r1", "c1"), cellFormulaOf(d, "r9", "c3")]).toEqual(["= 5", undefined, undefined]);
    expect(isSheetDoc(d)).toBe(true);
    // Without its own formula, the cell takes the formula of the column again. A row without such cells has no record of them.
    expect(setCellFormula(d, "r1", "c3", undefined).rows[0]?.formulas).toEqual({ c2: "= 1" });
    expect(setCellFormula(setCellFormula(d, "r1", "c3", undefined), "r1", "c2", undefined).rows[0]).not.toHaveProperty("formulas");
    expect(deleteColumn(d, "c3").rows[0]?.formulas).toEqual({ c2: "= 1" });
    expect(deleteColumn(deleteColumn(d, "c3"), "c2").rows[0]).not.toHaveProperty("formulas");
    const row = d.rows[0];
    expect(isSheetDoc({ ...d, rows: [{ ...row, formulas: { c9: "= 1" } }] })).toBe(false);
    expect(isSheetDoc({ ...d, rows: [{ ...row, formulas: { c3: 1 } }] })).toBe(false);
    expect(isSheetDoc({ ...d, rows: [{ ...row, formulas: "= 1" }] })).toBe(false);
  });

  it("FORMULA.GRID.ADDRESS: a grid has letters for its columns, and each cell keeps its text as its own formula", () => {
    expect([0, 25, 26, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
    let g = emptyGrid("G", 3, 2);
    expect([g.mode, g.columns.map((c) => c.name), g.rows.length, isSheetDoc(g)]).toEqual(["grid", ["A", "B", "C"], 2, true]);
    expect(freeLetter(g)).toBe("D");
    expect(freeLetter({ ...g, columns: g.columns.filter((c) => c.name !== "B") })).toBe("B");
    g = setCellText(setCellText(g, "r1", "c1", "=B1 * 2"), "r1", "c2", "21");
    expect([cellTextOf(g, "r1", "c1"), cellTextOf(g, "r1", "c2"), cellTextOf(g, "r2", "c1")]).toEqual(["=B1 * 2", "21", ""]);
    expect(g.rows[0]?.formulas).toEqual({ c1: "=B1 * 2", c2: "21" });
    // An empty text empties the cell, and a table keeps the text of a value cell in its cells.
    expect(setCellText(g, "r1", "c2", " ").rows[0]?.formulas).toEqual({ c1: "=B1 * 2" });
    expect(setCellText(emptyDoc(), "r1", "c2", "5").rows[0]?.cells).toEqual({ c2: "5" });
    expect(cellTextOf(setCellText(emptyDoc(), "r1", "c2", "5"), "r1", "c2")).toBe("5");
    expect(isSheetDoc({ ...g, mode: "list" })).toBe(false);
  });

  it("checks a document: unique ids, known parents and the blocks of the tree", () => {
    expect(EXAMPLES.filter((e) => !isSheetDoc(e.doc)).map((e) => e.id)).toEqual([]);
    const base = sample();
    expect(isSheetDoc({ ...base, rows: [...base.rows, base.rows[0]] })).toBe(false);
    expect(isSheetDoc({ ...base, rows: [base.rows[1], base.rows[0]] })).toBe(false);
    // r4 is a child of r1, but it comes after r5, a root: the block of r1 is broken.
    expect(isSheetDoc({ ...base, rows: [...base.rows.filter((r) => r.id !== "r4"), { id: "r4", parent: "r1", cells: {} }] })).toBe(false);
    expect(isSheetDoc({ ...base, version: 2 })).toBe(false);
    expect(isSheetDoc(null)).toBe(false);
  });
});
