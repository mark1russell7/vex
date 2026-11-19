/**
 * The read line of the speed gate of the compiler. Each process of `gate.ts` prints one read line for its case, as JSON.
 * `gate-processes.ts` reads the lines of all its processes, and decides each case with `processVerdict` of rigor-bench.
 *
 * A read line holds the facts of the verdict at full precision. These are the ratio, the A/A band, the tier, the fallbacks
 * and the limits of the CPU model. The text lines of a process are for a person, and no script reads them.
 *
 * A read line that is not valid gives its reason, not a throw. Thus one bad process does not stop the gate, and the other
 * cases keep their records.
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

/** This function gives the limits part of a text line: the limit, the slow line, the slow count, the noise cap and the model. */
export function limitsText(limits: CpuEntry<ProcessLimits>): string {
  const { limit, slow = limit, maxSlow, noiseCap } = limits.value;
  const count = maxSlow === undefined ? "a record only" : `at most ${String(maxSlow)} slow`;
  const cap = noiseCap === undefined ? "no noise cap" : `noise cap ${String(noiseCap)}`;
  return `limit ${String(limit)}, slow line ${String(slow)}, ${count}, ${cap}, for ${limits.model}`;
}

/** This function tells if a value is a finite number. */
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** This function examines the limits of a read line, and gives them, or the reason that they are not valid. */
function limitsOf(value: unknown, where: string): CpuEntry<ProcessLimits> | string {
  const entry = value as { readonly model?: unknown; readonly value?: { readonly limit?: unknown; readonly slow?: unknown; readonly maxSlow?: unknown; readonly noiseCap?: unknown } } | null;
  const l = entry?.value;
  const optional = (x: unknown): boolean => x === undefined || finite(x);
  if (typeof entry?.model !== "string" || l === undefined || !finite(l.limit) || !optional(l.slow) || !optional(l.maxSlow) || !optional(l.noiseCap)) {
    return `the limits of ${where} are not a CPU model with a limit`;
  }
  const numberOf = (x: unknown): number | undefined => (finite(x) ? x : undefined);
  const [slow, maxSlow, noiseCap] = [numberOf(l.slow), numberOf(l.maxSlow), numberOf(l.noiseCap)];
  return {
    model: entry.model,
    value: { limit: l.limit, ...(slow === undefined ? {} : { slow }), ...(maxSlow === undefined ? {} : { maxSlow }), ...(noiseCap === undefined ? {} : { noiseCap }) },
  };
}

/** This function gives the JSON value of a text, or undefined when the text is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** This function examines the JSON of one read line, and gives the read, or the reason that the line is not valid. */
function readOf(json: string): GateRead | string {
  const value = jsonOf(json);
  const where = `the read line ${json.slice(0, 80)}`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return `${where} is not a JSON object`;
  const r: Readonly<Record<string, unknown>> = Object.fromEntries(Object.entries(value));
  const aa = r["aa"];
  if (typeof r["case"] !== "string") return `${where} has no case`;
  if (!finite(r["ratio"]) || r["ratio"] <= 0) return `the ratio of ${where} is not a finite number above 0`;
  if (!Array.isArray(aa) || aa.length !== 2 || !finite(aa[0]) || !finite(aa[1]) || aa[0] > aa[1]) return `the A/A band of ${where} is not two finite numbers, low then high`;
  if (!Number.isInteger(r["tier"]) || !Number.isInteger(r["fallbacks"])) return `the tier or the fallbacks of ${where} are not whole numbers`;
  const limits = limitsOf(r["limits"], where);
  if (typeof limits === "string") return limits;
  return { case: r["case"], ratio: r["ratio"], aa: [aa[0], aa[1]], tier: r["tier"] as number, fallbacks: r["fallbacks"] as number, limits };
}

/** The read lines of the output of one process: the valid reads, and the reason of each line that is not valid. */
export interface ParsedReads {
  readonly reads: readonly GateRead[];
  readonly bad: readonly string[];
}

/** This function reads the read lines of the output of one process. A line that is not valid gives its reason in `bad`. */
export function parseReads(stdout: string): ParsedReads {
  const reads: GateRead[] = [];
  const bad: string[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t.startsWith(PREFIX)) continue;
    const read = readOf(t.slice(PREFIX.length));
    if (typeof read === "string") bad.push(read);
    else reads.push(read);
  }
  return { reads, bad };
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
