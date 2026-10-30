// This script finds each "Stryker disable" comment in the sources of the packages and compares the comments with
// the list in disables.json. A disabled mutant is a claim that the mutant is equivalent, and the claim raises the
// score. Thus a new disable must also go into the list, with its reason, in the same change. The script gives the
// number of disables of each file, and it fails when the sources and the list are not the same.
//
//   node tools/mutation/disables.mjs           compare the sources with the list
//   node tools/mutation/disables.mjs --write   write the list from the sources
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string, comment: string }} Disable */

const root = fileURLToPath(new URL("../../", import.meta.url));
const listFile = fileURLToPath(new URL("./disables.json", import.meta.url));

/** @type {(dir: string) => string[]} */
const sourcesOf = (dir) => {
  if (!existsSync(dir)) return [];
  // The lint of the types of tools/ does not have Array#toSorted, and sort() changes only the new array of readdirSync.
  return readdirSync(dir, { encoding: "utf8" })
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort((x, y) => x.localeCompare(y))
    .flatMap((f) => (statSync(`${dir}/${f}`).isDirectory() ? sourcesOf(`${dir}/${f}`).map((g) => `${f}/${g}`) : [f]))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
};

/** @type {(xs: Disable[]) => Map<string, number>} */
const counts = (xs) => {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const x of xs) {
    const k = `${x.file}: ${x.comment}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

/** @type {Disable[]} */
const found = [];
for (const pkg of readdirSync(`${root}packages`, { encoding: "utf8" })) {
  for (const f of sourcesOf(`${root}packages/${pkg}/src`)) {
    const file = `packages/${pkg}/src/${f}`;
    for (const line of readFileSync(`${root}${file}`, "utf8").split("\n")) {
      if (line.includes("Stryker disable")) found.push({ file, comment: line.trim() });
    }
  }
}

// No disable at all means that the script read the wrong folder: the sources have more than 100 disables.
if (found.length === 0) {
  console.error(`disables: no "Stryker disable" comment in ${root}packages/*/src. The script expected the sources of the packages there.`);
  process.exit(1);
}

// Each disable gives its reason after a colon: "Stryker disable next-line <Mutator>: <reason>".
const noReason = found.filter((d) => !/Stryker disable [^:]+: \S/.test(d.comment));
for (const d of noReason) console.error(`a disable without a reason: ${d.file}: ${d.comment}`);

if (noReason.length === 0 && process.argv.includes("--write")) {
  writeFileSync(listFile, `${JSON.stringify(found, null, 2)}\n`);
  console.info(`disables: wrote ${String(found.length)} comments to tools/mutation/disables.json`);
} else if (noReason.length > 0) {
  process.exitCode = 1;
} else {
  const listed = /** @type {Disable[]} */ (JSON.parse(readFileSync(listFile, "utf8")));
  const a = counts(found);
  const b = counts(listed);
  const added = [...a].filter(([k, n]) => n > (b.get(k) ?? 0)).map(([k]) => k);
  const removed = [...b].filter(([k, n]) => n > (a.get(k) ?? 0)).map(([k]) => k);

  /** @type {Map<string, number>} */
  const perFile = new Map();
  for (const d of found) perFile.set(d.file, (perFile.get(d.file) ?? 0) + 1);
  console.info(`disables: ${String(found.length)} in ${String(perFile.size)} files`);
  for (const [file, n] of perFile) console.info(`  ${file}: ${String(n)}`);

  if (added.length > 0 || removed.length > 0) {
    for (const k of added) console.error(`not in the list: ${k}`);
    for (const k of removed) console.error(`in the list, not in the sources: ${k}`);
    console.error("disables: the sources and tools/mutation/disables.json are not the same. Add each new disable with its reason, or start the script with --write and examine the diff.");
    process.exitCode = 1;
  }
}
