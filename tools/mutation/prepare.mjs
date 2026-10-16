// This script copies the sources and the tests of the four published packages to work/. Stryker reads only the
// files under its working folder, and its Vitest runner loads the Vitest of that folder (4.1, not 5).
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
rmSync(`${here}work`, { recursive: true, force: true });
for (const p of ["core", "domains", "testkit", "compiler"]) {
  cpSync(`${here}../../packages/${p}/src`, `${here}work/${p}`, { recursive: true });
}
// A standalone module copies the text of each op function. Stryker adds its counters to the functions of
// work/domains, so the tests of the modules read a copy of the domains that Stryker does not mutate.
cpSync(`${here}../../packages/domains/src`, `${here}work/domains-plain`, { recursive: true, filter: (f) => !f.endsWith(".test.ts") });
