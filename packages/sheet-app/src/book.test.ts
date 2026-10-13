import { describe, expect, it } from "vitest";
import { activeOf, addTable, bookOf, freeTitle, isBook, removeTable, showTable, toBook, withActive } from "./book.ts";
import { emptyDoc, setCell } from "./doc.ts";

describe("the book", () => {
  it("SHEET.TABLES: a book has tables, shows one of them, and an edit changes the table on the screen", () => {
    const b = bookOf(emptyDoc("Orders"), emptyDoc("Products"));
    expect([activeOf(b).title, b.tables.length, isBook(b)]).toEqual(["Orders", 2, true]);
    expect(withActive(b, (d) => d)).toBe(b);
    const edited = withActive(showTable(b, 1), (d) => setCell(d, "r1", "c1", "Pens"));
    expect([edited.tables[0], edited.tables[1]?.rows[0]?.cells]).toEqual([b.tables[0], { c1: "Pens" }]);
    expect([showTable(b, 0), showTable(b, 5)]).toEqual([b, b]);
  });

  it("SHEET.TABLES: a new table gets a free title, and a book keeps one table at least", () => {
    const b = addTable(addTable(bookOf(emptyDoc("Table")), "table"), "grid");
    expect([b.tables.map((t) => t.title), b.active, b.tables[2]?.mode]).toEqual([["Table", "Table 2", "Grid"], 2, "grid"]);
    // The test of a free title ignores the case of the letters, and the new title keeps the case of its base.
    expect([freeTitle(b, "table"), freeTitle(b, "Orders")]).toEqual(["table 3", "Orders"]);
    const fewer = removeTable(b, 0);
    expect([fewer.tables.map((t) => t.title), fewer.active]).toEqual([["Table 2", "Grid"], 1]);
    expect(removeTable(removeTable(fewer, 1), 0).tables.map((t) => t.title)).toEqual(["Table 2"]);
    expect(removeTable(b, 9)).toBe(b);
    expect(removeTable(showTable(b, 0), 2).active).toBe(0);
  });

  it("reads a book, or one table as a book, and nothing else", () => {
    const one = emptyDoc("One");
    expect(toBook(one)).toEqual(bookOf(one));
    expect(toBook(bookOf(one))).toEqual(bookOf(one));
    for (const bad of [null, [], { version: 1, tables: [], active: 0 }, { version: 1, tables: [one], active: 1 }, { version: 2, tables: [one], active: 0 }, { version: 1, tables: [{}], active: 0 }]) expect(toBook(bad)).toBeUndefined();
  });
});
