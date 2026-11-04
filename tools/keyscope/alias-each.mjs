// This script makes the printer give the alias form on each module, for the byte figure of the two forms of V-082.
import { readFileSync, writeFileSync } from "node:fs";

const [file] = process.argv.slice(2);
const old = 'const inner = wordsOf(code.replace(ERROR_NOTE, "")).includes(name) ? innerName(name, namesOfCode(code)) : name;';
const text = readFileSync(file, "utf8");
if (text.split(old).length !== 2) throw new Error(`not one match: ${old}`);
writeFileSync(file, text.replace(old, () => 'const inner = "run$0";'));
