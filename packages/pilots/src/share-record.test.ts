import { describe, expect, it } from "vitest";
import { corpusCases, readCorpora, type Corpus } from "./corpus.ts";
import { measureShare } from "./fallback-share.ts";
import { publicRows, readRecord, RECORD_SCALE, RECORD_SEED } from "./share-record.ts";

const UPDATE = "start `pnpm --filter @vex/pilots run share-record` to write the record again";

describe("the record of the share of tier 2 (CORPUSGATE)", () => {
  const record = readRecord();
  const rows = publicRows();

  it("keeps the inputs of the public rows", () => {
    expect([record.seed, record.scale]).toStrictEqual([RECORD_SEED, RECORD_SCALE]);
  });

  it("gives no share that is lower than its record", () => {
    for (const row of rows) {
      const old = record.rows.find((r) => r.source === row.source);
      expect(old, `the record has no row "${row.source}": ${UPDATE}`).toBeDefined();
      expect(old?.ci, `the row "${row.source}" is public`).toBeUndefined();
      // A higher share passes. Write the record again, so that the record keeps the gain.
      expect(row.programShare, `the program share of "${row.source}" is lower than its record`).toBeGreaterThanOrEqual(old?.programShare ?? 1);
      expect(row.valueShare, `the value share of "${row.source}" is lower than its record`).toBeGreaterThanOrEqual(old?.valueShare ?? 1);
    }
  });

  it("computes each public row of the record again", () => {
    const sources = new Set(rows.map((r) => r.source));
    const local = record.rows.filter((r) => r.ci === false);
    for (const old of record.rows.filter((r) => r.ci !== false)) expect(sources.has(old.source), `no source "${old.source}": ${UPDATE}`).toBe(true);
    for (const old of local) expect(old.note, `the row "${old.source}" tells where it was measured`).toBeTypeOf("string");
  });
});

describe("the cases of a corpus", () => {
  const corpus: Corpus = {
    source: "test",
    programs: [
      {
        name: "subtree-sum",
        why: "It adds the weight of each node to the weights of its descendants.",
        program: { tag: "app", op: "add", args: [{ tag: "ref", path: ["w"] }, { tag: "app", op: "sum", args: [{ tag: "each", axis: { t: "descendants" }, body: { tag: "ref", path: ["w"] } }] }] },
        space: { kind: "tree", records: { r: { w: 1 }, a: { w: 2 }, b: { w: 3 } }, parents: { r: null, a: "r", b: "r" } },
      },
      {
        name: "add-k",
        why: "It adds the variable k to the field n, at one origin.",
        program: '{"tag":"app","op":"add","args":[{"tag":"ref","path":["n"]},{"tag":"var","name":"k"}]}',
        space: { kind: "array", records: [{ n: 1 }, { n: 2 }] },
        vars: { k: 3 },
        origins: ["1"],
      },
      { name: "tier-only", why: "It has no space, so only its tier counts.", program: { tag: "lit", value: 1 } },
    ],
  };

  it("runs each program at each origin, as the tool vex_evaluate does", () => {
    const report = measureShare(corpusCases(corpus));
    expect(report.skipped).toStrictEqual([]);
    expect(report.programs.map((p) => [p.name, p.tier, p.runs, p.values])).toStrictEqual([
      ["subtree-sum", 2, 3, 3],
      ["add-k", 2, 1, 1],
      ["tier-only", 2, 0, 0],
    ]);
    expect(report.totals.valueShare).toBe(1);
  });

  it("puts a program that does not parse in the skipped programs", () => {
    const report = measureShare(corpusCases({ source: "bad", programs: [{ name: "bad", why: "It does not parse.", program: { tag: "nope" } }] }));
    expect(report.skipped.map((s) => s.name)).toStrictEqual(["bad"]);
  });

  it("reads no corpus from a missing folder", () => {
    expect(readCorpora(new URL("./no-such-folder/", import.meta.url))).toStrictEqual([]);
  });
});
