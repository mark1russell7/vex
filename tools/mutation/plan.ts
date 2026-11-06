// This script plans the parts of a run of the lane, and it writes them to the outputs of the job.
//
// With --full, a run has each part (the weekly run). A dispatch of the nightly job can name parts in VEX_PARTS, as a JSON
// list. Each other night reads only the files that changed in the last 25 hours (LANE.DELAY). The commits are the commits of
// the main line, each with its diff to the line, so a merge counts on the day of the merge. On Saturday the weekly run
// reads each file, so the night has no parts.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { changedParts, laneParts } from "./layout.ts";

/** This function gives the files that changed on the main line in the last 25 hours. */
function changedFiles(): string[] {
  const log = spawnSync("git", ["log", "--first-parent", "-m", "--name-only", "--format=", "--since=25.hours", "HEAD"], { encoding: "utf8" });
  if (log.status !== 0) throw new Error(`git log failed: ${log.stderr}`);
  return [...new Set(log.stdout.split("\n").filter((line) => line !== ""))];
}

/** This function gives the parts of this run, and the changed files that each part reads. An empty list of files reads each file. */
function plan(): { readonly parts: readonly string[]; readonly changed: readonly string[] } {
  if (process.argv.includes("--full")) return { parts: laneParts(), changed: [] };
  const named = process.env["VEX_PARTS"] ?? "";
  if (named !== "") return { parts: JSON.parse(named) as string[], changed: [] };
  if (new Date().getUTCDay() === 6) return { parts: [], changed: [] };
  const { parts, files } = changedParts(fileURLToPath(new URL("../../", import.meta.url)), changedFiles());
  return { parts, changed: files };
}

const { parts, changed } = plan();
const lines = [`parts=${JSON.stringify(parts)}`, `changed=${changed.join(",")}`];
console.info(lines.join("\n"));
const output = process.env["GITHUB_OUTPUT"];
if (output !== undefined) appendFileSync(output, `${lines.join("\n")}\n`);
