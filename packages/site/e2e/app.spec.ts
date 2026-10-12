/**
 * The browser tests of the sheet app at /app/: edits, rows, the keyboard, undo, the filter, export and share links.
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
