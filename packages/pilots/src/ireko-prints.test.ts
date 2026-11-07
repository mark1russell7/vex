import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IREKO_MODULES, irekoSource } from "./ireko-modules.ts";
import { currentPrints, printsDrift, printsText, readPrints, sha256 } from "./ireko-prints.ts";

describe("the hashes of the prints of ireko (COMPILE.MODULE.BYTES.HASH)", () => {
  it("COMPILE.MODULE.BYTES.HASH: the committed file has the sha256 of the build print of each module", () => {
    expect(printsDrift(readPrints(), currentPrints())).toBeUndefined();
  });

  it("COMPILE.MODULE.BYTES.HASH: the file has one sorted key for each module, and each hash is of the UTF-8 bytes of the print", () => {
    const { prints } = currentPrints();
    expect(Object.keys(prints)).toStrictEqual([...IREKO_MODULES].toSorted());
    expect(Object.keys(prints)).toHaveLength(16);
    const grid = Buffer.from(irekoSource("grid", "value"), "utf8");
    expect(prints["grid"]).toBe(createHash("sha256").update(grid).digest("hex"));
  });

  it("COMPILE.MODULE.BYTES.HASH: the message names each module that differs and the command that writes the file", () => {
    const current = { prints: { a: sha256("a"), b: sha256("b"), c: sha256("c") } };
    const committed = printsText({ prints: { a: sha256("a"), b: sha256("x"), d: sha256("d") } });
    const message = printsDrift(committed, current);
    expect(message).toContain("differs from the prints of these modules: b, c, d.");
    expect(message).toContain("node packages/pilots/scripts/ireko-prints.ts --write");
    expect(printsDrift(printsText(current), current)).toBeUndefined();
  });

  it("COMPILE.MODULE.BYTES.HASH: a text with equal hashes and another form, or a text that is not JSON, is a difference", () => {
    const current = { prints: { a: sha256("a") } };
    expect(printsDrift(JSON.stringify(current), current)).toContain("not the text of the file");
    expect(printsDrift("{", current)).toContain("these modules: a.");
  });
});
