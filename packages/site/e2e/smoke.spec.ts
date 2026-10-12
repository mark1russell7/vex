import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const dist = fileURLToPath(new URL("../dist", import.meta.url));

/** This function gives each route of the build: each folder with an index.html. */
function routes(dir: string = dist): readonly string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith("_") || name === "pagefind") continue;
      out.push(...routes(p));
    } else if (name === "index.html") {
      out.push(relative(dist, dir).replaceAll("\\", "/"));
    }
  }
  return out;
}

/** This function scrolls a widget into view and waits until its island has hydrated. */
async function hydrated(region: ReturnType<Page["getByRole"]>): Promise<void> {
  await region.scrollIntoViewIfNeeded();
  // Astro removes the attribute "ssr" from an island when the island hydrates.
  await expect(region.locator("xpath=ancestor::astro-island[1]")).not.toHaveAttribute("ssr", /.*/);
}

/** This function collects the console errors and the page errors of a page. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
  return problems;
}

for (const route of routes()) {
  test(`the page /${route} renders without errors`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(route === "" ? "./" : `./${route}/`);
    await expect(page.locator("h1").first()).toBeVisible();
    // Wait for the islands to start.
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
}

test("the stepper on the home page evaluates the overlap program", async ({ page }) => {
  await page.goto("./");
  const stepper = page.getByRole("region", { name: "Does the box overlap another box?" });
  await hydrated(stepper);
  await expect(stepper.getByText("Result at A:")).toBeVisible();
  await expect(stepper.locator(".vx-chip[data-state='ok']").first()).toHaveText("true");
  await stepper.getByRole("button", { name: "C", exact: true }).click();
  await expect(stepper.getByText("Result at C:")).toBeVisible();
});

test("the Lab reads a typed chain, evaluates it at each record, and shows an error with its position", async ({ page }) => {
  await page.goto("./lab/");
  const lab = page.getByRole("region", { name: "The Lab" });
  await hydrated(lab);
  const results = lab.getByRole("table", { name: "The result at each record" });
  await expect(results.getByRole("row").first()).toContainText("5");
  const editor = lab.getByRole("textbox", { name: "The Vex chain" });
  await editor.fill('root.from("weight")._.multiply(10)');
  await expect(results.getByRole("row").first()).toContainText("20");
  await editor.fill('root.from("weight")._.multiply(10');
  await expect(lab.getByRole("alert")).toContainText("line 1");
  await editor.fill("root.constructor");
  await expect(lab.getByRole("alert")).toContainText("not a member");
});

test("the Lab switches spaces, and a link opens the same program", async ({ page }) => {
  await page.goto("./lab/");
  const lab = page.getByRole("region", { name: "The Lab" });
  await hydrated(lab);
  await lab.getByRole("tab", { name: "Tree" }).click();
  await expect(lab.getByRole("button", { name: /Ada, CEO: 1110/ })).toBeVisible();
  const editor = lab.getByRole("textbox", { name: "The Vex chain" });
  await editor.fill("root.start(0).ancestors((a) => a).count()");
  await lab.getByRole("button", { name: "Copy link" }).click();
  await expect(page).toHaveURL(/#lab=/);
  const link = page.url();
  await page.goto("about:blank");
  await page.goto(link);
  const again = page.getByRole("region", { name: "The Lab" });
  await hydrated(again);
  await expect(again.getByRole("tab", { name: "Tree" })).toHaveAttribute("aria-selected", "true");
  await expect(again.getByRole("textbox", { name: "The Vex chain" })).toHaveValue("root.start(0).ancestors((a) => a).count()");
  await expect(again.getByRole("button", { name: /Cy, Developer: 2/ })).toBeVisible();
});

test("the Game of Life computes a generation with the Vex rule", async ({ page }) => {
  await page.goto("./gallery/life/");
  const life = page.getByRole("region", { name: "The Game of Life with a Vex rule" });
  await hydrated(life);
  await expect(life.getByText("generation 0")).toBeVisible();
  await life.getByRole("button", { name: "One generation" }).click();
  await expect(life.getByText("generation 1")).toBeVisible();
});

test("the living spec shows a chip for each requirement", async ({ page }) => {
  await page.goto("./spec/");
  await expect(page.locator('[id="req-EVAL.TOTAL"]')).toBeVisible();
  expect(await page.locator(".vx-chip[id^='req-']").count()).toBeGreaterThan(50);
});

test("the cycle lab marks each cell on a cycle", async ({ page }) => {
  await page.goto("./learn/sheets/");
  const lab = page.getByRole("region", { name: "The cycle lab" });
  await hydrated(lab);
  await expect(lab.getByTestId("cell-a")).toHaveText("#CYCLE!");
  await expect(lab.getByTestId("cell-b")).toHaveText("#CYCLE!");
  await expect(lab.getByTestId("cell-c")).toHaveText("3");
  // Without the read from b to a, the cycle is gone: a = 1 + b = 3, and c = 3 + a = 6.
  await lab.getByRole("checkbox", { name: "b reads a" }).uncheck();
  await expect(lab.getByTestId("cell-a")).toHaveText("3");
  await expect(lab.getByTestId("cell-c")).toHaveText("6");
  // A read of itself is a cycle, also with ifError.
  await lab.getByRole("checkbox", { name: "c reads c" }).check();
  await expect(lab.getByTestId("cell-c")).toHaveText("#CYCLE!");
});

test("the grid pilot gives the rectangles of the reference", async ({ page }) => {
  await page.goto("./gallery/grid/");
  const pilot = page.getByRole("region", { name: "The grid pilot" });
  await hydrated(pilot);
  await expect(pilot.getByTestId("grid-agrees")).toHaveText("equal to the reference");
  await pilot.getByRole("slider", { name: "columns" }).fill("3");
  await pilot.getByRole("button", { name: "New sizes" }).click();
  await expect(pilot.getByTestId("grid-agrees")).toHaveText("equal to the reference");
  await expect(pilot.locator("svg rect[rx]")).toHaveCount(7);
});

test("the site serves the JSON Schema of the IR and llms.txt", async ({ page }) => {
  const schema = await page.request.get("./ir.schema.json");
  expect(schema.ok()).toBe(true);
  expect(((await schema.json()) as { title?: string }).title).toBe("Vex expression");
  const llms = await page.request.get("./llms.txt");
  expect(llms.ok()).toBe(true);
  expect(await llms.text()).toContain("ir.schema.json");
});

test("the tree explorer gives the targets of each tree axis", async ({ page }) => {
  await page.goto("./learn/axes/");
  const explorer = page.getByRole("region", { name: "The tree explorer" });
  await hydrated(explorer);
  await expect(explorer.getByTestId("tree-targets")).toHaveText("descendants of Bo: Cy, Di, Fa");
  await expect(explorer.getByTestId("tree-cost")).toContainText("530");
  await explorer.getByRole("button", { name: "ancestors" }).click();
  await explorer.getByRole("button", { name: "Di, Developer" }).click();
  await expect(explorer.getByTestId("tree-targets")).toHaveText("ancestors of Di: Bo, Ada");
  await explorer.getByRole("button", { name: "siblings" }).click();
  await expect(explorer.getByTestId("tree-targets")).toHaveText("siblings of Di: Cy, Fa");
});

test("the live hero evaluates in each frame, and the reader can pause it", async ({ page }) => {
  await page.goto("./");
  const hero = page.getByRole("figure", { name: "Live: Vex programs evaluate at each box in each frame" });
  await expect(hero).toBeVisible();
  await expect(hero.getByText(/18 programs in \d+\.\d+ ms each frame/)).toBeVisible();
  const pause = hero.getByRole("button", { name: "Pause" });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(hero.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy the install command" })).toBeVisible();
});

test("with reduced motion, the hero does not move until the reader selects Play", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("./");
  await expect(page.getByRole("figure", { name: "Live: Vex programs evaluate at each box in each frame" }).getByRole("button", { name: "Play" })).toBeVisible();
  await context.close();
});

test("pointing at a box of the hero shows the list that the program gives at that box", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("./");
  const hero = page.getByRole("figure", { name: "Live: Vex programs evaluate at each box in each frame" });
  await hydrated(hero);
  const svg = hero.locator("svg");
  const box = await svg.boundingBox();
  if (box === null) throw new Error("the hero has no picture");
  // With reduced motion the boxes stay at the start state. Box E is near this point.
  await page.mouse.move(box.x + box.width * 0.17, box.y + box.height * 0.45);
  await expect(hero.getByText(/At [A-I], the program gives a list of 8 distances\. The minimum is \d+\.\d\d, to [A-I]\./)).toBeVisible();
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(hero.getByText("Point at a box to see its list.", { exact: false })).toBeVisible();
  await context.close();
});

test("the showcase links to each interactive page", async ({ page, request }) => {
  await page.goto("./");
  const links = page.locator(".vx-showcase a");
  await expect(links).toHaveCount(8);
  for (const href of await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test("the Lab survives an unfinished chain, and marks the position of the error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./lab/");
  await hydrated(page.getByRole("region", { name: "The Lab" }));
  const code = page.getByLabel("The Vex chain");
  await code.fill(`root.from("position")._`);
  await expect(page.getByRole("alert")).toContainText("op name is necessary");
  await code.fill(`root.frm("size")`);
  await expect(page.getByRole("alert")).toContainText("line 1, column 6");
  await expect(page.locator(".vx-lab-shadow .vx-syn-error")).toHaveText("frm");
  await code.fill(`root.from("position")._.add("size")`);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".vx-lab-shadow .vx-syn-root")).toHaveText("root");
  expect(errors).toEqual([]);
});

test("the layout audit finds the three findings of Jqy, and a move of a box changes the findings", async ({ page }) => {
  await page.goto("./gallery/audit/");
  const audit = page.getByRole("region", { name: "The layout audit" });
  await hydrated(audit);
  await expect(audit.getByRole("status")).toHaveText("3 findings");
  const checks = audit.getByRole("table", { name: "The checks at the selected box" });
  await expect(checks.getByRole("row", { name: /Outside the parent/ })).toContainText("fails");
  // Each child of api goes to its ring, but the ring is too small for the children, so the findings stay.
  await audit.getByRole("button", { name: "Place on the rings" }).click();
  await expect(audit.getByRole("status")).toHaveText("3 findings");
  // Move "web" 60 px down: it leaves its parent and its ring.
  const web = audit.getByRole("button", { name: /^web/ });
  await web.focus();
  for (let i = 0; i < 6; i++) await web.press("Shift+ArrowDown");
  await expect(audit.getByRole("status")).toHaveText("5 findings");
  await expect(checks.getByRole("row", { name: /Off the ring/ })).toContainText("fails");
  await audit.getByRole("button", { name: "Reset" }).click();
  await expect(audit.getByRole("status")).toHaveText("3 findings");
});
