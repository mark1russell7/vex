// This script finds each "Stryker disable" comment in the sources of the packages and compares the comments with
// the list in disables.json. A disabled mutant is a claim that the mutant is equivalent, and the claim raises the
// score. Thus a new disable must also go into the list, with its reason, in the same change. The script gives the
// number of disables of each file, and it fails when the sources and the list are not the same.
//
//   node tools/mutation/disables.mjs           compare the sources with the list
//   node tools/mutation/disables.mjs --write   write the list from the sources
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const listFile = fileURLToPath(new URL("./disables.json", import.meta.url));

/** @type {{ file: string, comment: string }[]} */
const found = [];
for (const pkg of readdirSync(`${root}packages`)) {
  let files;
  try {
    files = readdirSync(`${root}packages/${pkg}/src`, { recursive: true });
  } catch {
    continue;
  }
  for (const f of files.map((x) => String(x).replaceAll("\\", "/")).toSorted()) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const file = `packages/${pkg}/src/${f}`;
    for (const line of readFileSync(`${root}${file}`, "utf8").split("\n")) {
      if (line.includes("Stryker disable")) found.push({ file, comment: line.trim() });
    }
  }
}

// Each disable gives its reason after a colon: "Stryker disable next-line <Mutator>: <reason>".
const noReason = found.filter((d) => !/Stryker disable [^:]+: \S/.test(d.comment));
for (const d of noReason) console.error(`a disable without a reason: ${d.file}: ${d.comment}`);
if (noReason.length > 0) process.exit(1);

if (process.argv.includes("--write")) {
  writeFileSync(listFile, `${JSON.stringify(found, null, 2)}\n`);
  console.info(`disables: wrote ${String(found.length)} comments to tools/mutation/disables.json`);
  process.exit(0);
}

/** @type {{ file: string, comment: string }[]} */
const listed = JSON.parse(readFileSync(listFile, "utf8"));
const key = (/** @type {{ file: string, comment: string }} */ d) => `${d.file}\n${d.comment}`;
/** @type {(xs: { file: string, comment: string }[]) => Map<string, number>} */
const counts = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};
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
  for (const k of added) console.error(`not in the list: ${k.replace("\n", ": ")}`);
  for (const k of removed) console.error(`in the list, not in the sources: ${k.replace("\n", ": ")}`);
  console.error("disables: the sources and tools/mutation/disables.json are not the same. Add each new disable with its reason, or start the script with --write and examine the diff.");
  process.exit(1);
}
