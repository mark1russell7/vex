/**
 * The measures of the file `kpi.json` of the site. A reader outside the site takes the numbers from that file.
 * Each number comes from a committed file or from a record of GitHub, so no number has a person as its source.
 */
const REPOSITORY = "mark1russell7/vex";
const API = "https://api.github.com";
const DAY_MS = 86_400_000;
/** The release of this package gives the date of the lag. The four main packages have one version. */
const RELEASE_TAG = "@mark1russell7/vex-compiler@";

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

/** This function gives the count of passed scheduled runs of a workflow. */
async function scheduledGreenRun(get: Get, token: string, workflow: string): Promise<number> {
  const response = await read(get, token, `actions/workflows/${workflow}/runs?event=schedule&per_page=30`);
  const { workflow_runs: runs } = (await response.json()) as { workflow_runs: readonly { conclusion: string | null }[] };
  return greenRun(runs.map((run) => run.conclusion));
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

/** This function gives one measure, or one fault. A failed read gives no measure, so a reader sees an old reading and not a false number. */
async function measureOf(id: string, unit: string, at: string, value: () => Promise<number>): Promise<SiteMeasure | string> {
  try {
    return { id, value: await value(), unit, at };
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
    measureOf("weekly-green-run", "runs", at, () => scheduledGreenRun(get, token, "weekly.yml")),
    measureOf("nightly-green-run", "runs", at, () => scheduledGreenRun(get, token, "nightly.yml")),
    measureOf("npm-lag-days", "days", at, () => npmLag(get, token, now)),
  ]);
  return { measures: results.filter((x) => typeof x !== "string"), faults: results.filter((x) => typeof x === "string") };
}
