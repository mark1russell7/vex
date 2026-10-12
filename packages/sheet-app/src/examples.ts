/**
 * The example sheets. Each example shows one strength of Vex: roll-ups in a tree, ranks, a running total, and vectors.
 */
import type { Column, Row, SheetDoc } from "./doc.ts";

/** An example: an id for the menu, a title and a document. */
export interface Example {
  readonly id: string;
  readonly title: string;
  readonly doc: SheetDoc;
}

/** This function makes rows from `[id, parent, ...cells]` lists, in the order of the columns `cols`. */
function rows(cols: readonly string[], list: readonly (readonly (string | null)[])[]): Row[] {
  return list.map(([id, parent, ...cells]) => ({
    id: id ?? "",
    parent: parent ?? null,
    cells: Object.fromEntries(cols.flatMap((c, i) => (cells[i] === undefined || cells[i] === null ? [] : [[c, cells[i] ?? ""]]))),
  }));
}

const budgetCols: readonly Column[] = [
  { id: "c1", name: "Item", kind: "value", type: "text" },
  { id: "c2", name: "Cost", kind: "value", type: "number" },
  { id: "c3", name: "Total", kind: "formula", formula: "= IFERROR(Cost, 0) + SUM(children.Total)" },
  { id: "c4", name: "Share", kind: "formula", formula: "= Total / SUM(all, IFERROR(Cost, 0))" },
];

const gradeCols: readonly Column[] = [
  { id: "c1", name: "Name", kind: "value", type: "text" },
  { id: "c2", name: "Score", kind: "value", type: "number" },
  { id: "c3", name: "Rank", kind: "formula", formula: "= RANK(Score)" },
  { id: "c4", name: "Above average", kind: "formula", formula: "= Score > AVERAGE(all.Score)" },
  { id: "c5", name: "Grade", kind: "formula", formula: '= IF(Score >= 90, "A", IF(Score >= 80, "B", "C"))' },
];

const loanCols: readonly Column[] = [
  { id: "c1", name: "Month", kind: "value", type: "number" },
  { id: "c2", name: "Payment", kind: "value", type: "number" },
  { id: "c3", name: "Interest", kind: "formula", formula: "= IFERROR(row(-1).Balance, 10000) * 0.005" },
  { id: "c4", name: "Balance", kind: "formula", formula: "= IFERROR(row(-1).Balance, 10000) + Interest - Payment" },
];

const shapeCols: readonly Column[] = [
  { id: "c1", name: "Shape", kind: "value", type: "text" },
  { id: "c2", name: "Position", kind: "value", type: "vec2" },
  { id: "c3", name: "Size", kind: "value", type: "vec2" },
  { id: "c4", name: "Far corner", kind: "formula", formula: "= Position + Size" },
  { id: "c5", name: "Area", kind: "formula", formula: "= AREA(Size)" },
];

/** The example sheets. */
export const EXAMPLES: readonly Example[] = [
  {
    id: "budget",
    title: "A budget with groups",
    doc: {
      version: 1,
      title: "Budget",
      columns: budgetCols,
      rows: rows(["c1", "c2"], [
        ["r1", null, "Home"],
        ["r2", "r1", "Rent", "1200"],
        ["r3", "r1", "Power", "90"],
        ["r4", "r1", "Internet", "60"],
        ["r5", null, "Food"],
        ["r6", "r5", "Groceries", "450"],
        ["r7", "r5", "Dining out", "180"],
        ["r8", null, "Travel"],
        ["r9", "r8", "Train pass", "120"],
      ]),
    },
  },
  {
    id: "grades",
    title: "A grade book",
    doc: {
      version: 1,
      title: "Grades",
      columns: gradeCols,
      rows: rows(["c1", "c2"], [
        ["r1", null, "Ada", "94"],
        ["r2", null, "Bo", "81"],
        ["r3", null, "Cy", "77"],
        ["r4", null, "Di", "88"],
        ["r5", null, "Ed", "91"],
      ]),
    },
  },
  {
    id: "loan",
    title: "A loan schedule",
    doc: {
      version: 1,
      title: "Loan",
      columns: loanCols,
      rows: rows(["c1", "c2"], Array.from({ length: 12 }, (_, i) => [`r${i + 1}`, null, String(i + 1), "860"])),
    },
  },
  {
    id: "shapes",
    title: "Shapes with vectors",
    doc: {
      version: 1,
      title: "Shapes",
      columns: shapeCols,
      rows: rows(["c1", "c2", "c3"], [
        ["r1", null, "Header", "(0, 0)", "(12, 2)"],
        ["r2", null, "Sidebar", "(0, 2)", "(3, 8)"],
        ["r3", null, "Content", "(3, 2)", "(9, 8)"],
      ]),
    },
  },
];
