// This script copies the sources and the tests of the four published packages to work/, and the other folders of
// COPIES (layout.mjs). Stryker reads only the files under its working folder, and its Vitest runner loads the Vitest
// of that folder (4.1, not 5). Stryker does not mutate the copies outside work/.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COPIES, unresolvedImports } from "./layout.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
for (const top of new Set(COPIES.map((c) => c.to.split("/")[0]))) rmSync(`${here}${top}`, { recursive: true, force: true });
for (const c of COPIES) cpSync(`${root}${c.from}`, `${here}${c.to}`, { recursive: true, filter: (f) => c.tests || !f.endsWith(".test.ts") });
// A test file whose import finds no file does not load, and its mutants survive with no error (V-072).
const unresolved = unresolvedImports(root);
if (unresolved.length > 0) throw new Error(`These imports find no file in the copy of the lane. Add their folder to COPIES of layout.mjs:\n${unresolved.join("\n")}`);
