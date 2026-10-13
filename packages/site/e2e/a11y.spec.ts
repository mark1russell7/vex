/**
 * The accessibility check. axe-core examines each page of the built site with the rules of WCAG 2.1 AA, in the light
 * theme and in the dark theme. The list of pages comes from `dist`, so each new page joins the check.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { routes } from "./routes.ts";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const route of routes()) {
      test(`the page /${route} has no WCAG 2.1 AA violation`, async ({ page }) => {
        await page.goto(`./${route}`);
        await page.waitForLoadState("networkidle");
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const found = result.violations.map((v) => `${v.impact ?? ""} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
        expect(found).toEqual([]);
      });
    }
    // The chart and the mark of a cell with its own formula show only in some examples, so the check opens them too.
    for (const example of ["prey", "ball", "loan", "grid"]) {
      test(`the example ${example} of the app has no WCAG 2.1 AA violation`, async ({ page }) => {
        await page.goto(`./app/#example=${example}`);
        await expect(page.getByRole("treegrid")).toBeVisible();
        await expect(page.getByRole("contentinfo")).toContainText("Opened the example");
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(result.violations.map((v) => `${v.impact ?? ""} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
      });
    }
  });
}

// A code block scrolls when its lines are wider than the page, and the width depends on the fonts of the system.
// Thus each code block takes the keyboard focus on each system, and the check does not depend on the fonts.
test("each code block of the docs takes the keyboard focus", async ({ page }) => {
  await page.goto("./learn/sheets/");
  const blocks = page.locator(".expressive-code pre");
  expect(await blocks.count()).toBeGreaterThan(0);
  for (const tabindex of await blocks.evaluateAll((all) => all.map((p) => p.getAttribute("tabindex")))) expect(tabindex).toBe("0");
});
