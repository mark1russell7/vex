/**
 * This script compares each committed module of ireko with its print (COMPILE.MODULE.BYTES). The argument is the path of
 * the repository of ireko. The option `--write` prints each file again. The workflow `module-bytes.yml` starts it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IREKO_COMMITTED, IREKO_FILES, irekoSource, moduleDrift } from "../src/ireko-modules.ts";

const [root, flag] = process.argv.slice(2);
if (root === undefined) throw new Error("Give the path of the repository of ireko.");

let failed = 0;
for (const which of IREKO_COMMITTED) {
  const file = IREKO_FILES[which] ?? which;
  const printed = irekoSource(which, "value");
  if (flag === "--write") {
    writeFileSync(join(root, file), printed);
    process.stdout.write(`${file}: ${String(Buffer.byteLength(printed))} bytes\n`);
    continue;
  }
  const drift = moduleDrift(file, printed, readFileSync(join(root, file), "utf8"));
  if (drift !== undefined) {
    failed += 1;
    process.stderr.write(`${drift}\n\n`);
  }
}
if (failed > 0) throw new Error(`${String(failed)} of ${String(IREKO_COMMITTED.length)} committed modules differ from their print.`);
