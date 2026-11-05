import { describe, expect, it } from "vitest";
import { gitHubMeasures, greenRun, lagDays, lastPage, pendingRows, requirementCount, type Get, type ReadResponse } from "./kpi.ts";

const NOW = Date.parse("2026-11-05T12:00:00Z");

/** This function gives a response with a body and a `Link` header. */
function response(body: unknown, link: string | null = null, status = 200): ReadResponse {
  return { ok: status < 400, status, headers: { get: () => link }, json: () => Promise.resolve(body) };
}

/** This function gives a `Get` that answers from a table of URL parts. The first part that the URL holds gives the answer. */
function answers(table: readonly (readonly [string, ReadResponse])[], seen: string[] = []): Get {
  return (url, token) => {
    seen.push(`${token} ${url}`);
    const row = table.find(([part]) => url.includes(part));
    return row === undefined ? Promise.reject(new Error(`no answer for ${url}`)) : Promise.resolve(row[1]);
  };
}

const WEEKLY = ["weekly.yml", response({ workflow_runs: [{ conclusion: null }, { conclusion: "success" }, { conclusion: "failure" }, { conclusion: "success" }] })] as const;
const NIGHTLY = ["nightly.yml", response({ workflow_runs: [{ conclusion: "cancelled" }, { conclusion: "success" }] })] as const;
const RELEASES = ["releases?", response([{ tag_name: "@mark1russell7/vex-mcp@0.16.4", published_at: "2026-11-01T00:00:00Z" }, { tag_name: "@mark1russell7/vex-compiler@0.17.2", published_at: "2026-10-29T00:00:00Z" }])] as const;
const LAST = ["page=3", response([{ commit: { committer: { date: "2026-11-03T12:00:00Z" } } }])] as const;
const FIRST = ["commits?", response([{ commit: { committer: { date: "2026-11-05T00:00:00Z" } } }], '<https://x/commits?per_page=1&page=2>; rel="next", <https://x/commits?per_page=1&page=3>; rel="last"')] as const;

describe("the measures of kpi.json", () => {
  it("counts each requirement ID once", () => {
    expect(requirementCount("**[A.B]** one. **[A.B]** again. **[C-1]** two. [D] no. **[lower]** no.")).toBe(2);
    expect(requirementCount("nothing")).toBe(0);
  });

  it("counts only the rows with the status pending", () => {
    expect(pendingRows("| V-001 | pending | x |\n| V-002 | test | x |\n| V-003 | pending | y |\ntext | V-004 | pending |")).toBe(2);
    expect(pendingRows("")).toBe(0);
  });

  it("counts the green runs in a row, and a run that has not ended does not count", () => {
    expect(greenRun([null, "success", "success", "failure", "success"])).toBe(2);
    expect(greenRun(["cancelled", "success"])).toBe(0);
    expect(greenRun(["", "success"])).toBe(1);
    expect(greenRun([])).toBe(0);
  });

  it("gives the age of the oldest commit, and 0 with no commit", () => {
    expect(lagDays("2026-11-03T12:00:00Z", NOW)).toBe(2);
    expect(lagDays(undefined, NOW)).toBe(0);
  });

  it("reads the last page of a Link header", () => {
    expect(lastPage('<https://x?page=2>; rel="next", <https://x?per_page=1&page=7>; rel="last"')).toBe(7);
    expect(lastPage('<https://x?page=2>; rel="next"')).toBe(1);
    expect(lastPage(null)).toBe(1);
  });

  it("reads the runs and the lag from GitHub, with the time of the read and the token", async () => {
    const seen: string[] = [];
    const read = await gitHubMeasures(answers([WEEKLY, NIGHTLY, RELEASES, LAST, FIRST], seen), "t", NOW);
    expect(read.faults).toStrictEqual([]);
    expect(read.measures).toStrictEqual([
      { id: "weekly-green-run", value: 1, unit: "runs", at: "2026-11-05T12:00:00Z" },
      { id: "nightly-green-run", value: 0, unit: "runs", at: "2026-11-05T12:00:00Z" },
      { id: "npm-lag-days", value: 2, unit: "days", at: "2026-11-05T12:00:00Z" },
    ]);
    expect(seen.every((x) => x.startsWith("t https://api.github.com/repos/mark1russell7/vex/"))).toBe(true);
    expect(seen.some((x) => x.includes("since=2026-10-29T00:00:00Z"))).toBe(true);
  });

  it("gives a lag of 0 when main has no commit after the release", async () => {
    const read = await gitHubMeasures(answers([WEEKLY, NIGHTLY, RELEASES, ["commits?", response([])]]), "t", NOW);
    expect(read.measures.find((x) => x.id === "npm-lag-days")?.value).toBe(0);
  });

  it("gives no measure and one fault for a read that fails, and it keeps the other measures", async () => {
    const read = await gitHubMeasures(answers([["weekly.yml", response({}, null, 403)], NIGHTLY, ["releases?", response([])]]), "t", NOW);
    expect(read.measures.map((x) => x.id)).toStrictEqual(["nightly-green-run"]);
    expect(read.faults).toStrictEqual([
      "weekly-green-run: actions/workflows/weekly.yml/runs?event=schedule&per_page=30: the status is 403",
      "npm-lag-days: the last 100 releases have no release of vex-compiler",
    ]);
  });

  it("reads nothing with no token", async () => {
    const seen: string[] = [];
    for (const token of [undefined, ""]) {
      // oxlint-disable-next-line no-await-in-loop -- the two reads have no order and no cost.
      const read = await gitHubMeasures(answers([], seen), token, NOW);
      expect(read.measures).toStrictEqual([]);
      expect(read.faults).toHaveLength(1);
    }
    expect(seen).toStrictEqual([]);
  });
});
