/**
 * The example sheets. Each example shows one strength of Vex: roll-ups in a tree, ranks, a running total or vectors.
 * In the later examples, formulas read other formula columns in each direction of the tree. The loan, the rabbits and
 * the ball open with a chart.
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
  { id: "c3", name: "Interest", kind: "formula", formula: "= row(-1).Balance * 0.005" },
  { id: "c4", name: "Balance", kind: "formula", formula: "= row(-1).Balance + Interest - Payment" },
];

const shapeCols: readonly Column[] = [
  { id: "c1", name: "Shape", kind: "value", type: "text" },
  { id: "c2", name: "Position", kind: "value", type: "vec2" },
  { id: "c3", name: "Size", kind: "value", type: "vec2" },
  { id: "c4", name: "Far corner", kind: "formula", formula: "= Position + Size" },
  { id: "c5", name: "Area", kind: "formula", formula: "= AREA(Size)" },
];

// Widths go up the tree, and positions go down and across: a layout pass with a gap of 1 between children.
const layoutCols: readonly Column[] = [
  { id: "c1", name: "Box", kind: "value", type: "text" },
  { id: "c2", name: "Own", kind: "value", type: "number" },
  { id: "c3", name: "Width", kind: "formula", formula: "= IF(COUNT(children) = 0, Own, SUM(children.Width) + COUNT(children) - 1)" },
  { id: "c4", name: "X", kind: "formula", formula: "= IFERROR(row(-1).X + row(-1).Width + 1, IFERROR(parent.X, 0))" },
  { id: "c5", name: "Right", kind: "formula", formula: "= X + Width" },
  { id: "c6", name: "Share of page", kind: "formula", formula: '= Width / row("Page").Width' },
];

// Two columns that read each other one row up. Each read goes to an earlier row, so the sheet has no cycle.
const preyCols: readonly Column[] = [
  { id: "c1", name: "Week", kind: "value", type: "number" },
  { id: "c2", name: "Rabbits", kind: "formula", formula: "= IFERROR(row(-1).Rabbits * (1.1 - 0.002 * row(-1).Foxes), 100)" },
  { id: "c3", name: "Foxes", kind: "formula", formula: "= IFERROR(row(-1).Foxes * (0.9 + 0.001 * row(-1).Rabbits), 20)" },
  { id: "c4", name: "Rabbits per fox", kind: "formula", formula: "= Rabbits / Foxes" },
];

// A task starts when the task before it ends. A phase starts with its parent and ends with its last task.
const planCols: readonly Column[] = [
  { id: "c1", name: "Task", kind: "value", type: "text" },
  { id: "c2", name: "Days", kind: "value", type: "number" },
  { id: "c3", name: "Start", kind: "formula", formula: "= IFERROR(row(-1).Finish, IFERROR(parent.Start, 0))" },
  { id: "c4", name: "Finish", kind: "formula", formula: "= IF(COUNT(children) = 0, Start + Days, MAX(children.Finish))" },
  { id: "c5", name: "Days to launch", kind: "formula", formula: '= row("Launch").Start - Finish' },
];

// The velocity and the position step together. The time step comes from the column Time.
const ballCols: readonly Column[] = [
  { id: "c1", name: "Time", kind: "value", type: "number" },
  { id: "c2", name: "Velocity", kind: "formula", formula: "= IFERROR(row(-1).Velocity + VEC(0, -9.8 * (Time - row(-1).Time)), VEC(4, 12))" },
  { id: "c3", name: "Position", kind: "formula", formula: "= IFERROR(row(-1).Position + SCALE(row(-1).Velocity, Time - row(-1).Time), VEC(0, 0))" },
  { id: "c4", name: "Height", kind: "formula", formula: "= Y(Position)" },
  { id: "c5", name: "In the air", kind: "formula", formula: "= Height >= 0" },
];

// A z-score has an aggregate inside an aggregate: the mean of the squares of the distances from the mean.
const scoreCols: readonly Column[] = [
  { id: "c1", name: "Student", kind: "value", type: "text" },
  { id: "c2", name: "Score", kind: "value", type: "number" },
  { id: "c3", name: "Z-score", kind: "formula", formula: "= (Score - AVERAGE(all.Score)) / SQRT(AVERAGE(all, (Score - AVERAGE(all.Score)) ^ 2))" },
  { id: "c4", name: "Versus Ada", kind: "formula", formula: '= Score - row("Ada").Score' },
  { id: "c5", name: "Top half", kind: "formula", formula: "= RANK(Score) <= COUNT(all) / 2" },
];

// Totals go up the tree, and the level goes down it.
const orgCols: readonly Column[] = [
  { id: "c1", name: "Person", kind: "value", type: "text" },
  { id: "c2", name: "Role", kind: "value", type: "text" },
  { id: "c3", name: "Salary", kind: "value", type: "number" },
  { id: "c4", name: "Headcount", kind: "formula", formula: "= 1 + SUM(children.Headcount)" },
  { id: "c5", name: "Team cost", kind: "formula", formula: "= Salary + SUM(children.[Team cost])" },
  { id: "c6", name: "Level", kind: "formula", formula: "= IFERROR(parent.Level, 0) + 1" },
  { id: "c7", name: "Share", kind: "formula", formula: '= [Team cost] / row("Ada").[Team cost]' },
];

// The scale goes down the tree from the servings, and the cost goes up. The base recipe serves 4.
const recipeCols: readonly Column[] = [
  { id: "c1", name: "Item", kind: "value", type: "text" },
  { id: "c2", name: "Serves", kind: "value", type: "number" },
  { id: "c3", name: "Amount", kind: "value", type: "number" },
  { id: "c4", name: "Unit", kind: "value", type: "text" },
  { id: "c5", name: "Price", kind: "value", type: "number" },
  { id: "c6", name: "Scale", kind: "formula", formula: "= IF(COUNT(ancestors) = 0, Serves / 4, parent.Scale)" },
  { id: "c7", name: "Buy", kind: "formula", formula: '= IF(COUNT(children) = 0, ROUND(Amount * Scale) & " " & Unit, "")' },
  { id: "c8", name: "Cost", kind: "formula", formula: "= IF(COUNT(children) = 0, Amount * Scale * Price, SUM(children.Cost))" },
  { id: "c9", name: "Per serving", kind: "formula", formula: '= Cost / row("Pancakes").Serves' },
];

// A window of rows: each month reads the months before it with rows(from, to), not with a chain of row(-1) reads.
const salesCols: readonly Column[] = [
  { id: "c1", name: "Month", kind: "value", type: "text" },
  { id: "c2", name: "Sales", kind: "value", type: "number" },
  { id: "c3", name: "Average of 3", kind: "formula", formula: "= AVERAGE(rows(-2, 0).Sales)" },
  { id: "c4", name: "Year to date", kind: "formula", formula: "= SUM(rows(-11, 0).Sales)" },
  { id: "c5", name: "Best so far", kind: "formula", formula: "= MAX(rows(-11, 0).Sales)" },
  { id: "c6", name: "Change", kind: "formula", formula: "= Sales - row(-1).Sales" },
];

// Dates: a due date is a date plus some days, and a date minus a date is a count of days.
const invoiceCols: readonly Column[] = [
  { id: "c1", name: "Client", kind: "value", type: "text" },
  { id: "c2", name: "Issued", kind: "value", type: "date" },
  { id: "c3", name: "Terms", kind: "value", type: "number" },
  { id: "c4", name: "Due", kind: "formula", formula: "= Issued + Terms" },
  { id: "c5", name: "Pay by", kind: "formula", formula: "= IF(WEEKDAY(Due) = 1, Due + 1, IF(WEEKDAY(Due) = 7, Due + 2, Due))" },
  { id: "c6", name: "Paid", kind: "value", type: "date" },
  { id: "c7", name: "Days late", kind: "formula", formula: '= IFERROR(MAX(Paid - Due, 0), "")' },
  { id: "c8", name: "Status", kind: "formula", formula: '= IFERROR(IF(Paid > Due, "late", "on time"), "open")' },
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
      // The first month has no month before it, so its two cells have their own formulas: the loan starts at 10000.
      rows: rows(["c1", "c2"], Array.from({ length: 12 }, (_, i) => [`r${i + 1}`, null, String(i + 1), "860"])).map((r) =>
        r.id === "r1" ? { ...r, formulas: { c3: "= 10000 * 0.005", c4: "= 10000 + Interest - Payment" } } : r,
      ),
      chart: { x: "c1", series: ["c4"] },
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
  {
    id: "layout",
    title: "A page layout",
    doc: {
      version: 1,
      title: "Layout",
      columns: layoutCols,
      rows: rows(["c1", "c2"], [
        ["r1", null, "Page"],
        ["r2", "r1", "Nav", "3"],
        ["r3", "r1", "Main"],
        ["r4", "r3", "Text", "5"],
        ["r5", "r3", "Image", "4"],
        ["r6", "r1", "Aside", "2"],
      ]),
    },
  },
  {
    id: "prey",
    title: "Rabbits and foxes",
    doc: {
      version: 1,
      title: "Rabbits and foxes",
      columns: preyCols,
      rows: rows(["c1"], Array.from({ length: 30 }, (_, i) => [`r${i + 1}`, null, String(i)])),
      chart: { x: "c1", series: ["c2", "c3"] },
    },
  },
  {
    id: "plan",
    title: "A project plan",
    doc: {
      version: 1,
      title: "Project plan",
      columns: planCols,
      rows: rows(["c1", "c2"], [
        ["r1", null, "Design"],
        ["r2", "r1", "Sketch", "3"],
        ["r3", "r1", "Review", "2"],
        ["r4", null, "Build"],
        ["r5", "r4", "Code", "10"],
        ["r6", "r4", "Test", "4"],
        ["r7", null, "Launch", "0"],
      ]),
    },
  },
  {
    id: "ball",
    title: "A thrown ball",
    doc: {
      version: 1,
      title: "Thrown ball",
      columns: ballCols,
      rows: rows(["c1"], Array.from({ length: 12 }, (_, i) => [`r${i + 1}`, null, String(i / 4)])),
      chart: { x: null, series: ["c3"] },
    },
  },
  {
    id: "scores",
    title: "Test scores",
    doc: {
      version: 1,
      title: "Test scores",
      columns: scoreCols,
      rows: rows(["c1", "c2"], [
        ["r1", null, "Ada", "94"],
        ["r2", null, "Bo", "81"],
        ["r3", null, "Cy", "77"],
        ["r4", null, "Di", "88"],
        ["r5", null, "Ed", "91"],
        ["r6", null, "Flo", "69"],
      ]),
    },
  },
  {
    id: "org",
    title: "An org chart",
    doc: {
      version: 1,
      title: "Org chart",
      columns: orgCols,
      rows: rows(["c1", "c2", "c3"], [
        ["r1", null, "Ada", "CEO", "200"],
        ["r2", "r1", "Ben", "CTO", "150"],
        ["r3", "r2", "Cleo", "Engineer", "120"],
        ["r4", "r2", "Dev", "Engineer", "110"],
        ["r5", "r1", "Eve", "CFO", "140"],
        ["r6", "r5", "Finn", "Accountant", "90"],
      ]),
    },
  },
  {
    id: "sales",
    title: "Monthly sales",
    doc: {
      version: 1,
      title: "Monthly sales",
      columns: salesCols,
      // The first month has no month before it, so its change has its own formula.
      rows: rows(
        ["c1", "c2"],
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => [`r${i + 1}`, null, m, String([120, 135, 128, 150, 162, 155, 170, 182, 176, 195, 210, 205][i])]),
      ).map((r) => (r.id === "r1" ? { ...r, formulas: { c6: "= 0" } } : r)),
      chart: { x: null, series: ["c2", "c3"] },
    },
  },
  {
    id: "invoices",
    title: "Invoices with dates",
    doc: {
      version: 1,
      title: "Invoices",
      columns: invoiceCols,
      rows: rows(["c1", "c2", "c3", "c6"], [
        ["r1", null, "Acme", "2026-09-01", "30", "2026-09-28"],
        ["r2", null, "Birch", "2026-09-05", "30", "2026-10-09"],
        ["r3", null, "Cobalt", "2026-09-15", "14", "2026-09-29"],
        ["r4", null, "Delta", "2026-10-01", "30"],
        ["r5", null, "Ember", "2026-10-03", "45"],
      ]),
    },
  },
  {
    id: "recipe",
    title: "A recipe that scales",
    doc: {
      version: 1,
      title: "Recipe",
      columns: recipeCols,
      rows: rows(["c1", "c2", "c3", "c4", "c5"], [
        ["r1", null, "Pancakes", "6"],
        ["r2", "r1", "Batter"],
        ["r3", "r2", "Flour", null, "200", "g", "0.002"],
        ["r4", "r2", "Milk", null, "300", "ml", "0.0012"],
        ["r5", "r2", "Eggs", null, "2", "pcs", "0.25"],
        ["r6", "r1", "Topping"],
        ["r7", "r6", "Syrup", null, "60", "ml", "0.02"],
        ["r8", "r6", "Berries", null, "100", "g", "0.015"],
      ]),
    },
  },
];
