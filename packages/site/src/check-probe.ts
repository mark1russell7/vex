/**
 * The probe of the sheet app. The site check of the Pages workflow starts it in a browser at each width, before the
 * deploy. A failed check stops the deploy.
 *
 * The probe drives the core of the site: a compiled Vex formula over the rows of a sheet. A formula changes its column
 * as the reader writes. A bad formula shows its error. The filter keeps the rows that match.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];

const GRID = '[role="treegrid"]';
const EDITOR = '[aria-label="The formula of the column Total"]';
const FILTER = '[aria-label="Filter the rows"]';
const ERROR = ".vs-formula-error";
/** The columns of the budget example. */
const COLUMNS = ["Item", "Cost", "Total", "Share"];
/** The row of Rent. The first row of the table is its header. */
const RENT = 2;

const rows = (): Element[] => $$(`${GRID} [role="row"]`);
const cell = (row: number, column: string): Element | undefined => rows()[row]?.querySelectorAll('[role="gridcell"]')[COLUMNS.indexOf(column)];
const shown = (row: number, column: string): string => cell(row, column)?.textContent?.trim() ?? "";
const status = (): string => $("footer.vs-status")?.textContent ?? "";
/** This function writes a value into a field. React reads the value through the setter of the prototype. */
const write = (selector: string, value: string): void => {
  const field = $(selector) as HTMLInputElement | HTMLTextAreaElement;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
};

check("the app draws the sheet", await until(() => $(GRID)?.closest("astro-island[ssr]") === null), $("main")?.textContent?.slice(0, 200));
check("the app opens the budget example", await until(() => status().includes("9 rows · 4 columns")), status());
check("the value of Rent is in its cell", shown(RENT, "Cost") === "1,200", shown(RENT, "Cost"));
check("the formula of the column gives the total", shown(RENT, "Total") === "1,200", shown(RENT, "Total"));

// A cell of a formula column opens its formula. The grid selects on the press of the mouse.
cell(RENT, "Total")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
check("a cell opens the formula of its column", await until(() => $(EDITOR) !== null), status());

// The column changes as the reader writes.
write(EDITOR, "= Cost * 2");
check("a formula changes the column as the reader writes", await until(() => shown(RENT, "Total") === "2,400"), shown(RENT, "Total"));

// A bad formula shows its error.
write(EDITOR, "= Cost *");
check("a bad formula shows its error", await until(() => $(ERROR) !== null), ($(EDITOR) as HTMLTextAreaElement | null)?.value);

// A key ends the draft, and the old formula comes back.
write(EDITOR, "= Cost * 3");
await until(() => shown(RENT, "Total") === "3,600");
$(EDITOR)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("the Escape key gives the old formula", await until(() => shown(RENT, "Total") === "1,200"), shown(RENT, "Total"));
check("a good formula shows no error", $(ERROR) === null);

// The filter keeps the rows that match, with their parents and the header.
write(FILTER, "dining");
check("the filter keeps the rows that match", await until(() => rows().length === 3), rows().length);
write(FILTER, "");
check("an empty filter gives each row again", await until(() => rows().length === 10), rows().length);

export {};
