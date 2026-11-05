/**
 * The measures of the file `kpi.json` of the site. A reader outside the site takes the numbers from that file.
 * Each number comes from a committed file or from a record of GitHub, so no number has a person as its source.
 */
const REPOSITORY = "mark1russell7/vex";
const API = "https://api.github.com";
const DAY_MS = 86_400_000;
/** The release of this package gives the date of the lag. The four main packages have one version. */
const RELEASE_TAG = "@mark1russell7/vex-compiler@";
/** The things that the count of passed runs in a row does not read. */
const IN_A_ROW_NOT_COUNTED = "a run by hand, and a run that has not ended. A cancelled run ends the count";
/** The things that the count of passed runs of the window does not read. */
const WINDOW_NOT_COUNTED = "a run by hand, a run that has not ended, and a scheduled run before the last 30";

/** One measure of the file. */
export interface SiteMeasure {
  readonly id: string;
  readonly value: number;
  readonly unit?: string;
  readonly at?: string;
  readonly notCounted?: string;
}

/** The result of the read of GitHub: the measures that it read, and one line for each read that failed. */
export interface GitHubRead {
  readonly measures: readonly SiteMeasure[];
  readonly faults: readonly string[];
}

/** The part of a response of `fetch` that the read uses. */
export interface ReadResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** The function that gets one URL. */
export type Get = (url: string, token: string) => Promise<ReadResponse>;

/** This function counts the requirement IDs of the spec. Two places of one ID count as one. */
export function requirementCount(spec: string): number {
  return new Set(spec.match(/\*\*\[[A-Z][A-Z0-9.-]*\]\*\*/gu)).size;
}

/** This function counts the rows of the regressions file with the status `pending`. */
export function pendingRows(regressions: string): number {
  return regressions.match(/^\| V-\d{3} \| pending \|/gmu)?.length ?? 0;
}

/**
 * This function counts the runs that passed in a row, newest first. A run with no conclusion has not ended, so it does not count.
 * A cancelled run ends the count, as a failed run does.
 */
export function greenRun(conclusions: readonly (string | null)[]): number {
  const ended = conclusions.filter((x) => x !== null && x !== "");
  const failed = ended.findIndex((x) => x !== "success");
  return failed === -1 ? ended.length : failed;
}

/** One scheduled run, as GitHub gives it. */
export interface ScheduledRun {
  readonly conclusion: string | null;
  readonly created_at: string;
}

/**
 * This function gives the count of passed runs of a window, and a unit that names the window. The unit has the count of
 * ended runs, the date of the oldest run and the date of the last passed run. Thus a 0 tells its size. A run with no
 * conclusion has not ended, so it does not count. The list has the newest run first.
 */
export function greenWindow(runs: readonly ScheduledRun[]): { readonly value: number; readonly unit: string } {
  const ended = runs.filter((x) => x.conclusion !== null && x.conclusion !== "");
  const green = ended.filter((x) => x.conclusion === "success");
  const oldest = ended.at(-1);
  if (oldest === undefined) return { value: 0, unit: "of 0 scheduled runs" };
  const last = green[0]?.created_at.slice(0, 10) ?? "none in the window";
  return { value: green.length, unit: `of ${String(ended.length)} scheduled runs since ${oldest.created_at.slice(0, 10)}, last green ${last}` };
}

/** This function gives the age of a commit in days, with two decimals. With no commit, main is not ahead of npm, and the age is 0. */
export function lagDays(oldest: string | undefined, now: number): number {
  return oldest === undefined ? 0 : Number(((now - Date.parse(oldest)) / DAY_MS).toFixed(2));
}

/** This function gives the last page of a `Link` header, or 1 with no such link. */
export function lastPage(link: string | null): number {
  const match = /[?&]page=(\d+)[^>]*>; rel="last"/u.exec(link ?? "");
  return match === null ? 1 : Number(match[1]);
}

/** This function gets one path of the API, and it stops on a status that is not a success. */
async function read(get: Get, token: string, path: string): Promise<ReadResponse> {
  const response = await get(`${API}/repos/${REPOSITORY}/${path}`, token);
  if (!response.ok) throw new Error(`${path}: the status is ${String(response.status)}`);
  return response;
}

/** This function gives two measures of the scheduled runs of a workflow. They are the passed runs in a row and the passed runs of the last 30. */
async function scheduledRuns(get: Get, token: string, name: string, at: string): Promise<readonly SiteMeasure[]> {
  const response = await read(get, token, `actions/workflows/${name}.yml/runs?event=schedule&per_page=30`);
  const { workflow_runs: runs } = (await response.json()) as { workflow_runs: readonly ScheduledRun[] };
  return [
    { id: `${name}-green-run`, value: greenRun(runs.map((run) => run.conclusion)), unit: "runs in a row", at, notCounted: IN_A_ROW_NOT_COUNTED },
    { id: `${name}-green-in-window`, ...greenWindow(runs), at, notCounted: WINDOW_NOT_COUNTED },
  ];
}

/** This function gives the age in days of the oldest commit of main after the latest release. The last page of the list holds that commit. */
async function npmLag(get: Get, token: string, now: number): Promise<number> {
  const releases = (await (await read(get, token, "releases?per_page=100")).json()) as readonly { tag_name: string; published_at: string }[];
  const release = releases.find((x) => x.tag_name.startsWith(RELEASE_TAG));
  if (release === undefined) throw new Error("the last 100 releases have no release of vex-compiler");
  const list = `commits?sha=main&since=${release.published_at}&per_page=1`;
  const first = await read(get, token, list);
  const page = lastPage(first.headers.get("link"));
  const commits = (await (page === 1 ? first : await read(get, token, `${list}&page=${String(page)}`)).json()) as readonly { commit: { committer: { date: string } } }[];
  return lagDays(commits.at(-1)?.commit.committer.date, now);
}

/** This function gives the measures of one read, or one fault. A failed read gives no measure, so a reader sees an old reading and not a false number. */
async function measuresOf(id: string, measures: () => Promise<readonly SiteMeasure[]>): Promise<readonly SiteMeasure[] | string> {
  try {
    return await measures();
  } catch (error) {
    return `${id}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * This function reads the measures of the runs and of the release from GitHub. With no token, it reads nothing: a build of a
 * pull request has no token.
 */
export async function gitHubMeasures(get: Get, token: string | undefined, now: number): Promise<GitHubRead> {
  if (token === undefined || token === "") return { measures: [], faults: ["no token, so the file has no measure of the runs or of the release"] };
  const at = new Date(now).toISOString().replace(/\.\d+Z$/u, "Z");
  const results = await Promise.all([
    measuresOf("weekly-green-run", () => scheduledRuns(get, token, "weekly", at)),
    measuresOf("nightly-green-run", () => scheduledRuns(get, token, "nightly", at)),
    measuresOf("npm-lag-days", async () => [{ id: "npm-lag-days", value: await npmLag(get, token, now), unit: "days", at }]),
  ]);
  return { measures: results.filter((x) => typeof x !== "string").flat(), faults: results.filter((x) => typeof x === "string") };
}
