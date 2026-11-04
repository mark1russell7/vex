/**
 * This script compares each committed module of ireko with its print (COMPILE.MODULE.BYTES). The argument is the path of
 * the repository of ireko. The option `--write` prints each file again. The option `--published` takes the JSON list of
 * the versions of the compiler, and the script fails for a pin that is too old. The workflow `module-bytes.yml` starts it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IREKO_COMMITTED, IREKO_FILES, irekoSource, moduleDrift, PIN_LIMIT, versionsBehind } from "../src/ireko-modules.ts";

const [root, flag, list] = process.argv.slice(2);
if (root === undefined) throw new Error("Give the path of the repository of ireko.");

if (flag === "--published") {
  const { version } = JSON.parse(readFileSync(new URL("../../compiler/package.json", import.meta.url), "utf8")) as { readonly version: string };
  const behind = versionsBehind(version, JSON.parse(list ?? "[]") as readonly string[]);
  if (behind > PIN_LIMIT) {
    throw new Error(`The pin of vex is at version ${version}, ${String(behind)} published versions behind. Move the pin, and print the files again with --write.`);
  }
}

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
