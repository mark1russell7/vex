/**
 * The decision of a speed gate over fresh processes (GATENOISE, STRATEGY.md of the fleet, 2026-11-02). Each fresh
 * process of Node.js is one sample, as each user gets one process. A gate script prints one result line for each case,
 * with the limits of the case. This module reads the lines of k processes and decides each case with two checks:
 *
 * - (a) The median ratio of the valid processes is at most the limit of the case.
 * - (b) The count of valid processes above the slow line of the case is at most the largest slow count.
 *
 * The limits of a case depend on the CPU model of the runner (`limitsFor`), and each result line names its model.
 *
 * A process is valid for a case only when its A/A band contains 1.0. The functions here are pure, so tests give them
 * lines and get the decision.
 */
import { median } from "./measure.ts";

/**
 * The limits of one case on one CPU model: (a) the median limit, and (b) the slow line with the largest count of slow
 * processes. Without `maxSlow`, check (b) is a record only: the count is printed, but it cannot fail the case.
 */
export interface CaseLimits {
  readonly limit: number;
  readonly slow: number;
  readonly maxSlow?: number;
  /** This value is the CPU model of the limits (a part of its name), or `other` for the worst limits of all models. */
  readonly model: string;
}

/**
 * The limits of one case for each CPU model with 5 or more derivation runs, by a part of the model name. The entry
 * `other` holds the limits from all derivation runs, for each other model.
 */
export type ModelLimits = Readonly<Record<string, Omit<CaseLimits, "model">>> & { readonly other: Omit<CaseLimits, "model"> };

/**
 * This function gives the limits of a case for the CPU model `cpu`: the limits of the model that it contains, or `other`.
 * The comparison ignores the case, because a runner can give the name of one model in capital letters.
 */
export function limitsFor(byModel: ModelLimits, cpu: string): CaseLimits {
  const name = cpu.toLowerCase();
  const known = Object.entries(byModel).find(([part]) => part !== "other" && name.includes(part.toLowerCase()));
  return known === undefined ? { ...byModel.other, model: "other" } : { ...known[1], model: known[0] };
}

/** The result of one case in one process, as the result line of a gate script gives it. */
export interface CaseSample {
  readonly title: string;
  readonly ratio: number;
  /** This value is true when the tier and the fallbacks of the case were correct in the process. */
  readonly tierOk: boolean;
  readonly aa: readonly [number, number];
  readonly limits: CaseLimits;
}

/** The decision of one case over the processes. */
export interface CaseDecision {
  readonly title: string;
  readonly ok: boolean;
  readonly median: number;
  readonly slowCount: number;
  readonly ratios: readonly number[];
  readonly limits: CaseLimits;
  readonly reasons: readonly string[];
}

const LINE =
  /^(?:ok {2}|FAIL) (.+?): tier (\d), (\d+) fallbacks, .*?(?:generated\/loops time|growth) ([\d.]+) \((?:lower is better, )?limit ([\d.]+), slow line ([\d.]+), (?:at most (\d+) slow|a record only), for ([\w-]+)\), A\/A noise ([\d.]+) to ([\d.]+)$/u;

/** This function gives the limits part of a result line, in the form that `parseLine` reads. */
export function limitsText(l: CaseLimits): string {
  const count = l.maxSlow === undefined ? "a record only" : `at most ${String(l.maxSlow)} slow`;
  return `limit ${String(l.limit)}, slow line ${String(l.slow)}, ${count}, for ${l.model}`;
}

/** This function reads one result line of a gate script, or gives undefined for another line. */
export function parseLine(line: string): CaseSample | undefined {
  const m = LINE.exec(line.trim());
  if (m === null) return undefined;
  const [, title = "", tier, fallbacks, ratio, limit, slow, maxSlow, model = "", lo, hi] = m;
  const limits: CaseLimits = { limit: Number(limit), slow: Number(slow), ...(maxSlow === undefined ? {} : { maxSlow: Number(maxSlow) }), model };
  return { title, ratio: Number(ratio), tierOk: tier === "2" && fallbacks === "0", aa: [Number(lo), Number(hi)], limits };
}

/** This function reads all the result lines of the output of one process. */
export function parseProcess(stdout: string): readonly CaseSample[] {
  return stdout.split("\n").flatMap((l) => parseLine(l) ?? []);
}

/** This function tells if the A/A band of a sample contains 1.0. */
export function isValid(s: CaseSample): boolean {
  return s.aa[0] <= 1 && s.aa[1] >= 1;
}

/** This function gives the titles of the cases, in the order of their first line. */
export function titlesOf(processes: readonly (readonly CaseSample[])[]): readonly string[] {
  return [...new Set(processes.flatMap((p) => p.map((s) => s.title)))];
}

/** This function tells if each case has `k` valid processes. */
export function complete(processes: readonly (readonly CaseSample[])[], k: number): boolean {
  return titlesOf(processes).every((t) => processes.filter((p) => p.some((s) => s.title === t && isValid(s))).length >= k);
}

/**
 * This function decides each case over the processes, with the first `k` valid processes of the case. A case fails when
 * it has fewer than `k` valid processes, when a process gave no line for it, when one process has a wrong tier or a
 * fallback, when its processes give different limits, or when a check (a) or (b) fails.
 */
export function decide(processes: readonly (readonly CaseSample[])[], k: number): readonly CaseDecision[] {
  return titlesOf(processes).map((title) => {
    const reasons: string[] = [];
    const present = processes.flatMap((p) => p.filter((s) => s.title === title));
    const missing = processes.length - present.length;
    if (missing > 0) reasons.push(`${String(missing)} processes gave no line`);
    if (present.some((s) => !s.tierOk)) reasons.push("a process had a wrong tier or a fallback");
    const limits = present[0]?.limits ?? { limit: Number.NaN, slow: Number.NaN, maxSlow: 0, model: "other" };
    if (present.some((s) => limitsText(s.limits) !== limitsText(limits))) reasons.push("the processes gave different limits");
    const ratios = present.filter((s) => isValid(s)).slice(0, k).map((s) => s.ratio);
    if (ratios.length < k) reasons.push(`${String(ratios.length)} valid processes, not ${String(k)}`);
    const m = median(ratios);
    const slowCount = ratios.filter((r) => r > limits.slow).length;
    if (!(m <= limits.limit)) reasons.push(`the median is above the limit`);
    if (limits.maxSlow !== undefined && slowCount > limits.maxSlow) reasons.push(`more than ${String(limits.maxSlow)} processes above the slow line`);
    return { title, ok: reasons.length === 0, median: m, slowCount, ratios, limits, reasons };
  });
}

/** This function gives the result line of a decision, in the form `ok   title: ...` or `FAIL title: ...`. */
export function decisionLine(d: CaseDecision): string {
  const rs = d.ratios.map((r) => r.toFixed(2)).join(", ");
  const why = d.reasons.length === 0 ? "" : `. ${d.reasons.join(", ")}`;
  const most = d.limits.maxSlow === undefined ? "a record only" : `at most ${String(d.limits.maxSlow)}`;
  return `${d.ok ? "ok  " : "FAIL"} ${d.title}: median ${d.median.toFixed(2)} of ${String(d.ratios.length)} valid processes (lower is better, limit ${String(d.limits.limit)} for ${d.limits.model}), ${String(d.slowCount)} above the slow line ${String(d.limits.slow)} (${most}), processes ${rs}${why}`;
}
