import { cpuEntry, processLimits, processNoiseCap, type JobReads, type ProcessLimits } from "@mark1russell7/rigor-bench";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITS, RULE_CASES, type LimitCase } from "./gate-limits.ts";

/** One read of `limit-jobs.json`: the process number, the ratio, and the low and the high end of the A/A band. */
type Read = readonly [number, number, number, number];

/** One CI job of `limit-jobs.json`, with the reads of each case in the order of its processes. */
interface LimitJob {
  readonly job: string;
  readonly run: string;
  readonly at: string;
  readonly cpu: string;
  readonly node: string;
  readonly lines: "read" | "text";
  readonly cases: Readonly<Record<string, readonly Read[]>>;
}

const { jobs } = JSON.parse(readFileSync(new URL("limit-jobs.json", import.meta.url), "utf8")) as { readonly jobs: readonly LimitJob[] };
/** The count of valid processes that decides a case, as in `gate-processes.ts`. */
const K = 11;
/** The fewest jobs of a CPU model that give it its own limits. */
const MINIMUM = 5;
/** The smallest decide rate of a noise cap. A cap with a lower rate makes too many quiet runs `no read`. */
const DECIDE = 0.95;

const derived = (Object.keys(LIMITS) as LimitCase[]).filter((c) => !RULE_CASES.includes(c));
/** The jobs of each CPU name. */
const byCpu = new Map<string, LimitJob[]>();
for (const j of jobs) byCpu.set(j.cpu, [...(byCpu.get(j.cpu) ?? []), j]);

/** This function gives the reads of one case of one job in the form of rigor-bench. */
const readsOf = (job: LimitJob, c: string): JobReads => ({
  job: job.job,
  reads: (job.cases[c] ?? []).map(([p, ratio, low, high]) => ({ process: `p${String(p)}`, case: c, ratio, aa: [low, high] as const })),
});

/** This function gives the limits of one case from its jobs: the noise cap first, then the limits with that cap. */
function derive(c: string, group: readonly LimitJob[]): ProcessLimits | string {
  const reads = group.map((j) => readsOf(j, c));
  const cap = processNoiseCap(reads, { k: K, bootstrap: { runs: 200 } });
  const noiseCap = cap.source === "jobs" && cap.decideRate >= DECIDE ? cap.cap : undefined;
  const fit = processLimits(reads, { k: K, digits: 2, ...(noiseCap === undefined ? {} : { noiseCap }) });
  return fit.source === "jobs" ? fit.limits : `${String(group.length)} jobs are too few`;
}

describe("the limits of the compiler gate", () => {
  it("has the reads of each derived case in each job", () => {
    expect(jobs.length).toBeGreaterThanOrEqual(MINIMUM);
    for (const j of jobs) {
      expect(Object.keys(j.cases).toSorted(), j.job).toEqual(derived.toSorted());
      for (const c of derived) expect(j.cases[c]!.length, `${j.job} ${c}`).toBeGreaterThanOrEqual(K);
    }
  });

  it("has an entry for each CPU model with 5 jobs or more, and no entry for another model", () => {
    for (const c of derived) {
      const keys = new Set(Object.keys(LIMITS[c]).filter((k) => k !== "other"));
      const used = new Set<string>();
      for (const [cpu, group] of byCpu) {
        const { model } = cpuEntry<ProcessLimits>(LIMITS[c], cpu);
        // A model with too few jobs takes `other`. A model with enough jobs has its own entry.
        expect(model === "other", `${c} ${cpu}: ${String(group.length)} jobs`).toBe(group.length < MINIMUM);
        if (model !== "other") used.add(model);
      }
      expect([...used].toSorted(), c).toEqual([...keys].toSorted());
    }
  });

  it("gives each entry from its jobs: the noise cap, the limit, the slow line and the largest slow count", () => {
    for (const c of derived) {
      const table: Readonly<Record<string, ProcessLimits>> = LIMITS[c];
      for (const [key, limits] of Object.entries(table)) {
        const group = key === "other" ? jobs : jobs.filter((j) => cpuEntry<ProcessLimits>(LIMITS[c], j.cpu).model === key);
        expect(limits, `${c} ${key}`).toEqual(derive(c, group));
      }
    }
  });

  it("keeps the rule of each case with no jobs: the limit 1, and check (b) as a record only", () => {
    for (const c of RULE_CASES) expect(LIMITS[c]).toEqual({ other: { limit: 1, slow: 1 } });
  });
});
