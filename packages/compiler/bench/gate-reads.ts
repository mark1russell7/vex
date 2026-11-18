/**
 * The read line of the speed gate of the compiler. Each process of `gate.ts` prints one read line for its case, as JSON.
 * `gate-processes.ts` reads the lines of all its processes, and decides each case with `processVerdict` of rigor-bench.
 *
 * A read line holds the facts of the verdict at full precision: the ratio, the A/A band, the tier, the fallbacks and the
 * limits of the CPU model. The text lines of a process are for a person, and no script reads them.
 */
import type { CpuEntry, ProcessLimits, ProcessRead } from "@mark1russell7/rigor-bench";

/** The read of one case in one process, as `gate.ts` prints it. */
export interface GateRead {
  readonly case: string;
  /** The time of the first arm divided by the time of the second arm: lower is better. */
  readonly ratio: number;
  /** The A/A band of the process: the 10th and the 90th percentiles of the A/A ratios of its rounds. */
  readonly aa: readonly [number, number];
  readonly tier: number;
  readonly fallbacks: number;
  /** The limits of the case for the CPU model of the runner, as `cpuEntry` gives them. */
  readonly limits: CpuEntry<ProcessLimits>;
}

/** The start of a read line. */
const PREFIX = "read ";

/** This function gives the read line of one read. */
export function readLine(read: GateRead): string {
  return `${PREFIX}${JSON.stringify(read)}`;
}

/** This function gives the limits part of a text line: the limit, the slow line, the largest slow count and the CPU model. */
export function limitsText(limits: CpuEntry<ProcessLimits>): string {
  const { limit, slow = limit, maxSlow } = limits.value;
  const count = maxSlow === undefined ? "a record only" : `at most ${String(maxSlow)} slow`;
  return `limit ${String(limit)}, slow line ${String(slow)}, ${count}, for ${limits.model}`;
}

/** This function tells if a value is a finite number. */
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** This function examines the limits of a read line, and gives them. */
function limitsOf(value: unknown, where: string): CpuEntry<ProcessLimits> {
  const entry = value as { readonly model?: unknown; readonly value?: { readonly limit?: unknown; readonly slow?: unknown; readonly maxSlow?: unknown } } | null;
  const l = entry?.value;
  if (typeof entry?.model !== "string" || l === undefined || !finite(l.limit) || !(l.slow === undefined || finite(l.slow)) || !(l.maxSlow === undefined || finite(l.maxSlow))) {
    throw new Error(`gate-reads: the limits of ${where} are not a CPU model with a limit.`);
  }
  return { model: entry.model, value: { limit: l.limit, ...(l.slow === undefined ? {} : { slow: l.slow }), ...(l.maxSlow === undefined ? {} : { maxSlow: l.maxSlow }) } };
}

/** This function examines the JSON of one read line, and gives the read. */
function readOf(json: string): GateRead {
  const r = JSON.parse(json) as Record<string, unknown> | null;
  const where = `the read line ${json.slice(0, 80)}`;
  const aa = r?.["aa"];
  if (r === null || typeof r["case"] !== "string") throw new Error(`gate-reads: ${where} has no case.`);
  if (!finite(r["ratio"]) || r["ratio"] <= 0) throw new Error(`gate-reads: the ratio of ${where} is not a finite number above 0.`);
  if (!Array.isArray(aa) || aa.length !== 2 || !finite(aa[0]) || !finite(aa[1]) || aa[0] > aa[1]) throw new Error(`gate-reads: the A/A band of ${where} is not two finite numbers, low then high.`);
  if (!Number.isInteger(r["tier"]) || !Number.isInteger(r["fallbacks"])) throw new Error(`gate-reads: the tier or the fallbacks of ${where} are not whole numbers.`);
  return { case: r["case"], ratio: r["ratio"], aa: [aa[0], aa[1]], tier: r["tier"] as number, fallbacks: r["fallbacks"] as number, limits: limitsOf(r["limits"], where) };
}

/** This function reads the read lines of the output of one process. It refuses a read line that is not valid. */
export function parseReads(stdout: string): readonly GateRead[] {
  return stdout.split("\n").flatMap((line) => {
    const t = line.trim();
    return t.startsWith(PREFIX) ? [readOf(t.slice(PREFIX.length))] : [];
  });
}

/** This function tells if two limits are the same. */
function sameLimits(a: CpuEntry<ProcessLimits>, b: CpuEntry<ProcessLimits>): boolean {
  return limitsText(a) === limitsText(b);
}

/**
 * This function gives the read of `processVerdict` for one read line of the case `title` with the limits `limits`. A
 * wrong tier, a fallback, another case or other limits are a fault of the process, and a fault blocks the case.
 */
export function processRead(process: string, title: string, limits: CpuEntry<ProcessLimits>, read: GateRead): ProcessRead {
  const faults = [
    ...(read.case === title ? [] : [`the case "${read.case}", not "${title}"`]),
    ...(read.tier === 2 ? [] : [`tier ${String(read.tier)}`]),
    ...(read.fallbacks === 0 ? [] : [`${String(read.fallbacks)} fallbacks`]),
    ...(sameLimits(read.limits, limits) ? [] : [`the limits ${limitsText(read.limits)}, not ${limitsText(limits)}`]),
  ];
  return { process, case: title, ratio: read.ratio, aa: read.aa, ...(faults.length === 0 ? {} : { fault: faults.join(", ") }) };
}
