import { app, cell, each, offset, ref, axes, lit, type Expr } from "@mark1russell7/vex";
import { Vec2 } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { addRow, emptyDoc, setCell, type SheetDoc } from "./doc.ts";
import { evaluateDoc, type Compiler } from "./engine.ts";
import { exportCsv, importCsv, importJson, exportJson, parseCsv, toCsv, encodeShare, decodeShare } from "./io.ts";
import { commit, historyOf, redo, undo } from "./history.ts";
import { formatValue, parseValue } from "./values.ts";

/** A compiler for the tests: a formula is the JSON text of an expression. */
const json: Compiler = {
  compile: (text) => {
    try {
      return { ok: true, expr: JSON.parse(text) as Expr, reads: [] };
    } catch {
      return { ok: false, error: { message: "not JSON", span: { start: 0, end: text.length } } };
    }
  },
  toVexChain: (e) => JSON.stringify(e),
};

function doc(): SheetDoc {
  let d: SheetDoc = {
    ...emptyDoc(),
    columns: [
      { id: "c1", name: "Item", kind: "value", type: "text" },
      { id: "c2", name: "Cost", kind: "value", type: "number" },
      { id: "c3", name: "Total", kind: "formula", formula: JSON.stringify(app("add", app("ifError", ref("Cost"), lit(0)), app("sum", each(axes.children, cell("Total"))))) },
      { id: "c4", name: "Running", kind: "formula", formula: JSON.stringify(app("add", app("ifError", cell("Running", [offset(-1)]), lit(0)), app("ifError", ref("Cost"), lit(0)))) },
    ],
  };
  d = setCell(d, "r1", "c1", "Home");
  const a = addRow(d, "r1", true);
  d = setCell(setCell(a.doc, a.id, "c2", "1200"), a.id, "c1", "Rent");
  const b = addRow(d, a.id);
  d = setCell(b.doc, b.id, "c2", "90");
  const c = addRow(d, "r1");
  return setCell(c.doc, c.id, "c2", "7");
}

describe("the engine", () => {
  it("evaluates value cells and formula cells, with roll-ups in the tree and a running total among siblings", () => {
    const d = doc();
    const ev = evaluateDoc(d, json);
    const val = (r: string, c: string): unknown => {
      const res = ev.cell(r, c);
      return res === undefined ? undefined : res.ok ? res.value : res.error.code;
    };
    expect(d.rows.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(val("r2", "c2")).toBe(1200);
    expect(val("r1", "c2")).toBeUndefined();
    expect(val("r1", "c3")).toBe(1290);
    expect(val("r4", "c3")).toBe(7);
    // Running is a running total among siblings: r2 then r3 under r1, and r1 then r4 at the top.
    expect([val("r2", "c4"), val("r3", "c4"), val("r1", "c4"), val("r4", "c4")]).toEqual([1200, 1290, 0, 7]);
    expect(ev.explain("r1", "c3")?.events.length).toBeGreaterThan(0);
    expect(ev.errors).toBe(0);
  });

  it("gives #VALUE! for a value that is not of its type, and for a formula with an error", () => {
    let d = setCell(doc(), "r2", "c2", "lots");
    d = { ...d, columns: [...d.columns, { id: "c5", name: "Bad", kind: "formula", formula: "{" }] };
    const ev = evaluateDoc(d, json);
    const r = ev.cell("r2", "c2");
    expect(r?.ok === false && [r.error.code, r.error.message]).toEqual(["#VALUE!", '"lots" is not a number']);
    // The formula reads the text "lots", so the op gives #VALUE! too. A reduction that is not strict skips the error
    // item, so the total of the parent is the total of the other child. The formula language makes SUM strict.
    expect(ev.cell("r2", "c3")?.ok).toBe(false);
    expect(ev.cell("r1", "c3")).toEqual({ ok: true, value: 90 });
    const bad = ev.cell("r1", "c5");
    expect(bad?.ok === false && bad.error.message).toMatch(/formula of "Bad" has an error: not JSON/);
    expect(ev.errors).toBeGreaterThan(2);
  });

  it("gives #CYCLE! for each cell on a cycle, and the other cells stay correct", () => {
    const d: SheetDoc = {
      ...doc(),
      columns: [
        { id: "c2", name: "Cost", kind: "value", type: "number" },
        { id: "c5", name: "A", kind: "formula", formula: JSON.stringify(cell("B")) },
        { id: "c6", name: "B", kind: "formula", formula: JSON.stringify(cell("A")) },
        { id: "c7", name: "C", kind: "formula", formula: JSON.stringify(app("multiply", ref("Cost"), lit(2))) },
      ],
    };
    const ev = evaluateDoc(d, json);
    const code = (c: string): unknown => {
      const r = ev.cell("r2", c);
      return r?.ok === false ? r.error.code : r?.value;
    };
    expect([code("c5"), code("c6"), code("c7")]).toEqual(["#CYCLE!", "#CYCLE!", 2400]);
  });
});

describe("values", () => {
  it("reads the text of each type, and gives a reason for bad text", () => {
    expect(parseValue("number", " 1,234.5 ")).toEqual({ kind: "ok", value: 1234.5 });
    expect(parseValue("number", "12abc").kind).toBe("bad");
    expect(parseValue("boolean", "Yes")).toEqual({ kind: "ok", value: true });
    expect(parseValue("vec2", "(3, -4)")).toEqual({ kind: "ok", value: new Vec2(3, -4) });
    expect(parseValue("vec2", "3")).toMatchObject({ kind: "bad" });
    expect(formatValue((parseValue("date", " 2026-10-13 ") as { value: unknown }).value)).toBe("2026-10-13");
    expect(parseValue("date", "2026-02-30")).toEqual({ kind: "bad", reason: '"2026-02-30" is not a date like 2026-10-13' });
    expect(formatValue((parseValue("color", "#36f") as { value: unknown }).value)).toBe("#3366ff");
    expect(parseValue("color", "blue").kind).toBe("bad");
    expect(parseValue("text", "  ")).toEqual({ kind: "empty" });
    expect([formatValue(1234.5), formatValue(true), formatValue(new Vec2(1, 2)), formatValue(undefined)]).toEqual(["1,234.5", "TRUE", "(1, 2)", ""]);
  });
});

describe("import and export", () => {
  it("reads and writes CSV with quotes, commas and line breaks", () => {
    const rows = [["a", "b,c"], ['say "hi"', "line\nbreak"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
    expect(parseCsv("x,y\r\n1,2\r\n")).toEqual([["x", "y"], ["1", "2"]]);
  });

  it("keeps the tree and the value columns through CSV, and gives the values of formula columns", () => {
    const d = doc();
    const csv = exportCsv(d, evaluateDoc(d, json));
    expect(csv.split("\r\n")[0]).toBe("id,parent,Item,Cost,Total,Running");
    const back = importCsv(csv);
    expect(back.rows.map((r) => [r.id, r.parent])).toEqual(d.rows.map((r) => [r.id, r.parent]));
    expect(back.columns.find((c) => c.name === "Cost")).toMatchObject({ kind: "value", type: "number" });
    // A column of texts in the form YYYY-MM-DD is a column of dates.
    expect(importCsv("When,Note\n2026-10-13,a\n2026-10-14,b\n").columns.map((c) => (c.kind === "value" ? c.type : c.kind))).toEqual(["date", "text"]);
  });

  it("keeps a document through JSON and through a share link", async () => {
    const d = doc();
    expect(importJson(exportJson(d))).toEqual(d);
    expect(importJson("{")).toBeUndefined();
    expect(await decodeShare(await encodeShare(d))).toEqual(d);
    expect(await decodeShare("not-a-link")).toBeUndefined();
  });
});

describe("the history", () => {
  it("undoes and redoes changes, and a new change removes the redo steps", () => {
    const a = emptyDoc("a");
    const b = emptyDoc("b");
    const c = emptyDoc("c");
    let h = commit(commit(historyOf(a), b), c);
    h = undo(h);
    expect(h.present).toBe(b);
    expect(redo(h).present).toBe(c);
    h = commit(undo(h), c);
    expect([h.present, h.future.length, h.past.length]).toEqual([c, 0, 1]);
    expect(undo(historyOf(a)).present).toBe(a);
    expect(commit(h, h.present)).toBe(h);
  });
});
