/**
 * This script compares `packages/pilots/src/ireko-prints.json` with the sha256 of the print of each module of ireko
 * (COMPILE.MODULE.BYTES.HASH). The option `--write` writes the file again.
 */
import { writeFileSync } from "node:fs";
import { currentPrints, printsDrift, printsText, PRINTS_FILE, readPrints } from "../src/ireko-prints.ts";

const [flag] = process.argv.slice(2);
const current = currentPrints();
if (flag === "--write") {
  writeFileSync(PRINTS_FILE, printsText(current));
  process.stdout.write(`ireko-prints.json: ${String(Object.keys(current.prints).length)} modules\n`);
} else {
  const drift = printsDrift(readPrints(), current);
  if (drift !== undefined) {
    process.stderr.write(`${drift}\n`);
    process.exitCode = 1;
  }
}
