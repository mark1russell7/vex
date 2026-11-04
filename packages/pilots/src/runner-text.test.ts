import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IREKO_COMMITTED, IREKO_NOT_COMMITTED, irekoSource, TEXT_CASES, textOfCases } from "./ireko-modules.ts";

/** The output of the script under one runner. */
interface Printed {
  readonly modules: Readonly<Record<string, string>>;
  readonly cases: readonly string[];
}

const SCRIPT = fileURLToPath(new URL("../scripts/print-text.ts", import.meta.url));

/** This function gives the output of the script. The flags select the runner. */
function printed(flags: readonly string[]): Printed {
  const out = execFileSync(process.execPath, [...flags, SCRIPT], { encoding: "utf8", maxBuffer: 2 ** 26 });
  return JSON.parse(out) as Printed;
}

describe("the bytes of a print under each runner (COMPILE.MODULE.TEXT)", () => {
  const stripped = printed([]);
  const compiled = printed(["--import", "tsx"]);

  it("COMPILE.MODULE.TEXT: the runner that removes types and the runner that compiles give equal bytes", () => {
    expect(compiled).toEqual(stripped);
  });

  it("COMPILE.MODULE.TEXT: this test runner gives the same bytes, also for the case of the parentheses", () => {
    expect(textOfCases(TEXT_CASES)).toEqual(stripped.cases);
    expect(stripped.cases[0]).toBe("(a, b, c) => a && b || c");
    for (const which of [...IREKO_COMMITTED, ...IREKO_NOT_COMMITTED]) expect(irekoSource(which, "value")).toBe(stripped.modules[which]);
  });
});
