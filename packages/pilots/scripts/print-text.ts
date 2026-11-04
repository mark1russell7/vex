/**
 * This script writes the text of each module of ireko and of the functions of `TEXT_CASES` as JSON. A test starts it
 * under each runner and compares the bytes (COMPILE.MODULE.TEXT). The file has types, so a runner must remove them.
 */
import { IREKO_COMMITTED, IREKO_NOT_COMMITTED, irekoSource, TEXT_CASES, textOfCases } from "../src/ireko-modules.ts";

const modules = [...IREKO_COMMITTED, ...IREKO_NOT_COMMITTED].map((which): readonly [string, string] => [which, irekoSource(which, "value")]);
process.stdout.write(JSON.stringify({ modules: Object.fromEntries(modules), cases: textOfCases(TEXT_CASES) }));
