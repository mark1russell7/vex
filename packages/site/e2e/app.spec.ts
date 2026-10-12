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
