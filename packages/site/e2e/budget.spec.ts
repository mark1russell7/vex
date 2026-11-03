/**
 * The size budget. The check loads each page of the built site and adds the gzip size of each response. A page stays
 * at 256 kB or less, and its script stays at 164 kB or less. The heaviest page was 205 kB when the budget started.
 *
 * The script budget is the heaviest script that a build measured, plus 2 %, up to the next whole kB. On 2026-11-03 the
 * check of steps (STEPS) added 918 B of used code to the chunk of the sheet. The script of `/gallery/audit/` went to
 * 164511 B, over the old budget of 160 kB. Thus the budget became 164 kB (164511 B plus 2 % is 167801 B).
 */
import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { routes } from "./routes.ts";

const PAGE_BUDGET = 256 * 1024;
const SCRIPT_BUDGET = 164 * 1024;

for (const route of routes()) {
  test(`the page /${route} stays in the size budget`, async ({ page }) => {
    const sizes: Promise<{ readonly type: string; readonly gz: number }>[] = [];
    page.on("response", (r) => {
      sizes.push(
        r.body().then(
          (b) => ({ type: r.request().resourceType(), gz: gzipSync(b).length }),
          () => ({ type: "none", gz: 0 }),
        ),
      );
    });
    await page.goto(`./${route}`);
    await page.waitForLoadState("networkidle");
    const all = await Promise.all(sizes);
    const total = all.reduce((s, x) => s + x.gz, 0);
    const script = all.filter((x) => x.type === "script").reduce((s, x) => s + x.gz, 0);
    expect(total, `the page in bytes`).toBeLessThanOrEqual(PAGE_BUDGET);
    expect(script, `the script in bytes`).toBeLessThanOrEqual(SCRIPT_BUDGET);
  });
}
