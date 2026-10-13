/**
 * The browser tests of the sheet app at /app/: edits, rows, the keyboard, undo, the filter, export, share links and the
 * chart.
 */
import { expect, test, type Page } from "@playwright/test";

/** This function opens the app and waits until the grid is on the page. */
async function open(page: Page): Promise<void> {
  await page.goto("./app/");
  await expect(page.getByRole("treegrid")).toBeVisible();
}

const cell = (page: Page, row: number, column: string) =>
  page.getByRole("treegrid").getByRole("row").nth(row).getByRole("gridcell").nth(
    // The columns of the budget example: Item, Cost, Total, Share.
    ["Item", "Cost", "Total", "Share"].indexOf(column),
  );

test("the app opens the budget example, and an edit of a value cell changes the value", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("contentinfo")).toContainText("9 rows · 4 columns");
  const rent = cell(page, 2, "Cost");
  await expect(rent).toHaveText("1,200");
  await rent.dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("1300");
  await page.keyboard.press("Enter");
  await expect(rent).toHaveText("1,300");
  // A text that is not a number gives #VALUE! with the reason in the inspector.
  await rent.click();
  await page.keyboard.type("lots");
  await page.keyboard.press("Enter");
  await expect(rent).toHaveText("#VALUE!");
  await rent.click();
  await expect(page.getByRole("complementary", { name: "The inspector" })).toContainText('"lots" is not a number');
});

test("the keyboard adds, indents and moves rows, and undo gives the old document back", async ({ page }) => {
  await open(page);
  const grid = page.getByRole("treegrid");
  await cell(page, 9, "Item").click();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("contentinfo")).toContainText("10 rows");
  await page.keyboard.type("Bus");
  await page.keyboard.press("Enter");
  // The new row is a sibling of "Train pass", under "Travel" (level 2).
  await expect(grid.getByRole("row", { name: /Bus/ })).toHaveAttribute("aria-level", "2");
  await cell(page, 10, "Item").click();
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expect(grid.getByRole("row", { name: /Bus/ })).toHaveAttribute("aria-level", "1");
  await page.keyboard.press("Control+z");
  await expect(grid.getByRole("row", { name: /Bus/ })).toHaveAttribute("aria-level", "2");
  await page.keyboard.press("Control+y");
  await expect(grid.getByRole("row", { name: /Bus/ })).toHaveAttribute("aria-level", "1");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("contentinfo")).toContainText("9 rows");
});

test("the arrow keys move the selection, and the filter keeps the rows that match", async ({ page }) => {
  await open(page);
  await cell(page, 1, "Item").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 2, "Cost")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("searchbox", { name: "Filter the rows" }).fill("dining");
  // The match and its parent stay, so the tree around the match stays.
  await expect(page.getByRole("treegrid").getByRole("row")).toHaveCount(3);
});

test("the CSV export has the tree and the columns", async ({ page }) => {
  await open(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const file = await download;
  const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
  expect(text.split("\r\n")[0]).toBe("id,parent,Item,Cost,Total,Share");
  expect(text).toContain("r2,r1,Rent,1200,");
});

test("a share link opens the same sheet in a new browser", async ({ page, browser }) => {
  await open(page);
  await page.getByRole("textbox", { name: "The title of the sheet" }).fill("Shared budget");
  await page.getByRole("toolbar", { name: "The sheet" }).getByRole("button", { name: "Share" }).click();
  await expect(page).toHaveURL(/#sheet=/);
  const other = await (await browser.newContext()).newPage();
  await other.goto(page.url());
  await expect(other.getByRole("textbox", { name: "The title of the sheet" })).toHaveValue("Shared budget");
  await other.close();
});

test("a formula changes the column as you type, marks an error, and shows its Vex chain", async ({ page }) => {
  await open(page);
  const total = cell(page, 2, "Total");
  await expect(total).toHaveText("1,200");
  await total.click();
  const editor = page.getByRole("textbox", { name: "The formula of the column Total" });
  await editor.fill("= Cost * 2");
  // The draft changes the results before the edit ends.
  await expect(total).toHaveText("2,400");
  await editor.fill("= Cost *");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".vs-syn-bad")).toHaveCount(1);
  await editor.fill("= IFERROR(Cost, 0) * 3");
  await editor.press("Enter");
  await expect(total).toHaveText("3,600");
  await page.getByRole("button", { name: "Vex", exact: true }).click();
  await expect(page.getByLabel("The formula as a Vex chain")).toContainText('ifError');
  // Undo gives the old formula back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(total).toHaveText("1,200");
});

test("two formula columns that read each other give #CYCLE!, and completion offers the functions", async ({ page }) => {
  await open(page);
  await cell(page, 1, "Share").click();
  const share = page.getByRole("textbox", { name: "The formula of the column Share" });
  await share.fill("= Total");
  await share.press("Enter");
  await cell(page, 1, "Total").click();
  const total = page.getByRole("textbox", { name: "The formula of the column Total" });
  await total.fill("= Share + 1");
  await total.press("Enter");
  await expect(cell(page, 1, "Total")).toHaveText("#CYCLE!");
  await expect(cell(page, 1, "Share")).toHaveText("#CYCLE!");
  // Completion: a word at the caret offers the functions and the columns that start with it.
  await total.fill("= SU");
  await page.getByRole("button", { name: /^SUM/ }).click();
  await expect(total).toHaveValue(/= SUM\(/);
});

test("an example link opens the example, and a formula that reads a row by its name follows the name", async ({ page }) => {
  await page.goto("./app/#example=layout");
  await expect(page.getByRole("treegrid")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("6 rows · 6 columns");
  const at = (row: number, column: string) =>
    page.getByRole("treegrid").getByRole("row").nth(row).getByRole("gridcell").nth(["Box", "Own", "Width", "X", "Right", "Share of page"].indexOf(column));
  // The Image box starts after the Text box and a gap: 4 + 5 + 1.
  await expect(at(5, "X")).toHaveText("10");
  await expect(at(3, "Share of page")).toHaveText("0.588235");
  // The formula reads row("Page"). After a change of the name, no row has that name, and the column gives #VALUE!.
  const page0 = at(1, "Box");
  await page0.dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Screen");
  await page.keyboard.press("Enter");
  await expect(at(3, "Share of page")).toHaveText("#VALUE!");
  await at(3, "Share of page").click();
  await expect(page.getByRole("complementary", { name: "The inspector" })).toContainText('no row has the name "Page"');
});

test("a chart draws a line for each column of numbers, and a click on a point selects its row", async ({ page }) => {
  await page.goto("./app/#example=prey");
  const chart = page.getByRole("region", { name: "The chart" });
  await expect(chart.getByRole("img", { name: "A chart of Rabbits and Foxes across Week" })).toBeVisible();
  await expect(chart.locator("polyline")).toHaveCount(2);
  // A third column joins the chart. A click on a point of the first line selects the row of that point.
  await chart.getByRole("button", { name: "Rabbits per fox" }).click();
  await expect(chart.locator("polyline")).toHaveCount(3);
  await chart.locator("circle").nth(4).click();
  await expect(page.locator(".vs-address")).toContainText("row 5");
  // The chart draws only the rows on the screen. A filter that keeps no row leaves no point.
  const filter = page.getByRole("searchbox", { name: "Filter the rows" });
  await filter.fill("no such row");
  await expect(chart).toContainText("The columns have no numbers or vectors on the rows on the screen.");
  await filter.fill("");
  // The chart is a part of the document, so undo gives it back.
  await page.getByRole("button", { name: "Chart", exact: true }).click();
  await expect(chart).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(chart.locator("polyline")).toHaveCount(3);
  // A column of vectors gives a path, and the chart of the ball keeps one scale on the two axes.
  await page.getByRole("combobox", { name: "Open an example" }).selectOption("ball");
  await expect(chart.getByRole("img", { name: "A chart of Position" })).toBeVisible();
  await expect(chart.getByRole("img")).toHaveAccessibleDescription("Position: 12 points, x from 0 to 11, y from -0.6875 to 8.875.");
});

test("on a phone, the chart takes the width of the screen, and the page does not scroll to the side", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./app/#example=prey");
  const img = page.getByRole("region", { name: "The chart" }).getByRole("img");
  await expect(img).toBeVisible();
  await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeLessThanOrEqual(390 - 32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("a link opens its example in the same tab, and after an edit a reload keeps the edit", async ({ page }) => {
  await open(page);
  const title = page.getByRole("textbox", { name: "The title of the sheet" });
  await expect(title).toHaveValue("Budget");
  // The app is open, and the address changes: the app opens the example of the new link.
  await page.evaluate(() => {
    window.location.hash = "#example=prey";
  });
  await expect(title).toHaveValue("Rabbits and foxes");
  // The menu writes the example into the address, so the address is a link to it.
  await page.getByRole("combobox", { name: "Open an example" }).selectOption("ball");
  await expect(page).toHaveURL(/#example=ball$/);
  // An edit makes the link old. The app removes it, so a reload opens the changed sheet.
  await title.fill("My ball");
  await expect(page).toHaveURL(/\/app\/$/);
  await page.reload();
  await expect(title).toHaveValue("My ball");
});

test("a cell can have its own formula: the grid marks it, and the formula bar edits it", async ({ page }) => {
  await page.goto("./app/#example=loan");
  const balance = (row: number) => page.getByRole("treegrid").getByRole("row").nth(row).getByRole("gridcell").nth(3);
  // The first month has its own formula. The grid marks the cell, and a screen reader hears it.
  await expect(balance(1)).toHaveText("9,190, own formula");
  await expect(balance(1)).toHaveClass(/vs-own/);
  await balance(1).click();
  const own = page.getByRole("button", { name: "Own formula", exact: true });
  await expect(own).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "The own formula of Balance, row 1" })).toHaveValue("= 10000 + Interest - Payment");
  // The second month takes the formula of the column. Its own formula replaces that formula in this cell only.
  await balance(2).click();
  await expect(own).toHaveAttribute("aria-pressed", "false");
  await own.click();
  const editor = page.getByRole("textbox", { name: "The own formula of Balance, row 2" });
  await expect(editor).toHaveValue("= row(-1).Balance + Interest - Payment");
  await editor.fill("= 5000");
  await editor.press("Enter");
  await expect(balance(2)).toHaveText("5,000, own formula");
  await expect(balance(3)).toHaveText("4,165");
  // Without its own formula, the balance of the first month reads a month that does not exist. Undo gives it back.
  await balance(1).click();
  await own.click();
  await expect(balance(1)).toHaveText("#REF!");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(balance(1)).toHaveText("9,190, own formula");
});

test("a column of dates: a due date follows the date of the invoice, and a weekend moves to Monday", async ({ page }) => {
  await page.goto("./app/#example=invoices");
  const at = (row: number, column: string) =>
    page.getByRole("treegrid").getByRole("row").nth(row).getByRole("gridcell").nth(["Client", "Issued", "Terms", "Due", "Pay by", "Paid", "Days late", "Status"].indexOf(column));
  await expect(at(4, "Due")).toHaveText("2026-10-31");
  await expect(at(4, "Pay by")).toHaveText("2026-11-02");
  // One more day of terms puts the due date on a Sunday, so the invoice is due on the Monday after it.
  await at(4, "Terms").dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("31");
  await page.keyboard.press("Enter");
  await expect(at(4, "Due")).toHaveText("2026-11-01");
  await expect(at(4, "Pay by")).toHaveText("2026-11-02");
  // A day that does not exist is not a date. The cell gives #VALUE!, and the cell that reads it gives an error too.
  await at(4, "Issued").dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("2026-02-30");
  await page.keyboard.press("Enter");
  await expect(at(4, "Issued")).toHaveText("#VALUE!");
  await expect(at(4, "Due")).toHaveClass(/vs-cell-error/);
});

test("a grid has A1 addresses: a cell reads other cells, a range sums them, and a new grid starts empty", async ({ page }) => {
  await page.goto("./app/#example=grid");
  const at = (address: string) => {
    const [, letter = "A", row = "1"] = /^([A-Z])(\d+)$/.exec(address) ?? [];
    return page.getByRole("treegrid").getByRole("row").nth(Number(row)).getByRole("gridcell").nth(letter.charCodeAt(0) - 65);
  };
  await expect(at("D2")).toHaveText("15");
  await expect(at("D6")).toHaveText("52");
  // A new price changes the line and the total: 2 * 10 = 20, and 20 + 12 + 25 = 57.
  await at("B2").dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(at("D2")).toHaveText("20");
  await expect(at("D6")).toHaveText("57");
  // A text that starts with "=" is a formula. The bar shows the address of the cell.
  await at("E2").click();
  await expect(page.locator(".vs-address")).toHaveText("E2");
  await page.keyboard.type("=D6 * 2");
  await page.keyboard.press("Enter");
  await expect(at("E2")).toHaveText("114");
  await page.getByRole("button", { name: "New grid" }).click();
  await expect(page.getByRole("contentinfo")).toContainText("20 rows · 8 columns");
  await expect(page.getByRole("columnheader", { name: "H", exact: true })).toBeVisible();
});
