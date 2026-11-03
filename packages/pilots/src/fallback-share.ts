/**
 * The share of tier 2 on real programs (roadmap item FALLBACKSHARE). This module compiles programs with `tiered` of
 * `@mark1russell7/vex-compiler`. It counts the runs that tier 2 gives, and the runs that tier 1 does again after a
 * `FALLBACK`. It is a measurement, not a gate.
 */
import type { CompileFn, Expr, Program, Result } from "@mark1russell7/vex";
import { tiered, type GenerateOptions } from "@mark1russell7/vex-compiler";

/** A reason and the number of times that it occurs. */
export interface ReasonCount {
  readonly reason: string;
  readonly count: number;
}

/** The counts of one program. */
export interface ProgramShare {
  readonly name: string;
  /** The tier of the program: 2 when it has generated code, and else 1. */
  readonly tier: 1 | 2;
  /** The reason that the program has no generated code. */
  readonly reason?: string;
  /** The number of compiles of the program. A sheet compiles its formulas again in each new run. */
  readonly compiles: number;
  readonly runs: number;
  /** The number of runs where tier 2 gave `FALLBACK`, so tier 1 gave the result. */
  readonly fallbacks: number;
  /** The result of tier 1 on each run after a `FALLBACK`, by count, largest first. */
  readonly fallbackReasons: readonly ReasonCount[];
}

/** A program that the measurement could not run on the inputs of its tests, and the error. */
export interface SkippedProgram {
  readonly name: string;
  readonly reason: string;
}

/** The totals of a measurement. */
export interface ShareTotals {
  readonly programs: number;
  /** The number of programs of tier 2. */
  readonly tier2: number;
  /** The programs of tier 2 divided by the programs. */
  readonly programShare: number;
  readonly runs: number;
  /** The number of runs where tier 2 gave the value. */
  readonly tier2Runs: number;
  readonly fallbacks: number;
  /** The runs where tier 2 gave the value divided by the runs. A run of a program of tier 1 is not a run of tier 2. */
  readonly runShare: number;
  /** The reasons of the programs of tier 1, by count of programs, largest first. */
  readonly tier1Reasons: readonly ReasonCount[];
  /** The results of tier 1 after a `FALLBACK`, by count of runs, largest first. */
  readonly fallbackReasons: readonly ReasonCount[];
}

/** The result of a measurement. */
export interface ShareReport {
  readonly programs: readonly ProgramShare[];
  readonly skipped: readonly SkippedProgram[];
  readonly totals: ShareTotals;
}

/** The compilers of a measurement. Each program that they give counts its runs under its name. */
export interface Meter {
  /** This method compiles `source` with `tiered`, and it gives a program that counts its runs under `name`. */
  program(name: string, source: Expr, options?: GenerateOptions): Program;
  /** This method gives a compiler for a `SheetRun`. The function `nameOf` gives the name of the program of a formula. */
  compiler(nameOf: (expr: Expr) => string): CompileFn;
}

/** A group of real programs, and a function that runs them on the inputs of their tests with the compilers of a meter. */
export interface ShareCase {
  readonly name: string;
  readonly run: (meter: Meter) => void;
}

/** The counts of one program in a measurement. */
interface Tally {
  tier: 1 | 2;
  reason: string | undefined;
  compiles: number;
  runs: number;
  fallbacks: number;
  readonly reasons: Map<string, number>;
}

/** This function gives the reason of a run after a `FALLBACK`: the error of tier 1, or a note that tier 1 gave a value. */
export function fallbackReason(result: Result<unknown>): string {
  return result.ok ? "tier 1 gave a value" : `${result.error.code} ${result.error.kind}`;
}

/** This function adds `n` to the count of `key`. */
function add(counts: Map<string, number>, key: string, n = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + n);
}

/** This function gives the counts as a list, largest first. Two equal counts are in the order of their reasons. */
function sorted(counts: ReadonlyMap<string, number>): ReasonCount[] {
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .toSorted((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));
}

/** This function gives a meter that counts into `tallies`. */
function meterOf(tallies: Map<string, Tally>): Meter {
  const program = (name: string, source: Expr, options: GenerateOptions = {}): Program => {
    const p = tiered(source, options);
    let t = tallies.get(name);
    if (t === undefined) {
      t = { tier: p.tier, reason: p.reason, compiles: 0, runs: 0, fallbacks: 0, reasons: new Map() };
      tallies.set(name, t);
    } else if (t.tier !== p.tier) {
      // Two compiles of one name with different tiers: the name counts as tier 1, with the reason of tier 1.
      t.tier = 1;
      t.reason = t.reason ?? p.reason ?? "the tier is not the same in each compile";
    }
    const tally = t;
    tally.compiles++;
    return {
      expr: p.expr,
      run(r) {
        const before = p.stats.fallbacks;
        const result = p.run(r);
        tally.runs++;
        if (p.stats.fallbacks > before) {
          tally.fallbacks++;
          add(tally.reasons, fallbackReason(result));
        }
        return result;
      },
      explain: (r) => p.explain(r),
    };
  };
  return {
    program,
    compiler: (nameOf) => (expr, options) => program(nameOf(expr), expr, options),
  };
}

/** This function gives the share of a count, and 0 for no count. */
const share = (part: number, all: number): number => (all === 0 ? 0 : part / all);

/**
 * This function runs each case, and it gives the counts of each program and the totals. When a case throws, its
 * programs go to `skipped` with the error, and the totals do not count them.
 */
export function measureShare(cases: readonly ShareCase[]): ShareReport {
  const programs: ProgramShare[] = [];
  const skipped: SkippedProgram[] = [];
  for (const c of cases) {
    const tallies = new Map<string, Tally>();
    try {
      c.run(meterOf(tallies));
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      const names = tallies.size === 0 ? [c.name] : [...tallies.keys()];
      for (const name of names) skipped.push({ name, reason });
      continue;
    }
    for (const [name, t] of tallies) {
      programs.push({
        name,
        tier: t.tier,
        ...(t.reason === undefined ? {} : { reason: t.reason }),
        compiles: t.compiles,
        runs: t.runs,
        fallbacks: t.fallbacks,
        fallbackReasons: sorted(t.reasons),
      });
    }
  }
  const tier1 = new Map<string, number>();
  const fallbackReasons = new Map<string, number>();
  let runs = 0;
  let tier2Runs = 0;
  let fallbacks = 0;
  for (const p of programs) {
    runs += p.runs;
    if (p.tier === 2) {
      tier2Runs += p.runs - p.fallbacks;
      fallbacks += p.fallbacks;
    } else {
      add(tier1, p.reason ?? "no reason");
    }
    for (const r of p.fallbackReasons) add(fallbackReasons, r.reason, r.count);
  }
  const tier2 = programs.filter((p) => p.tier === 2).length;
  return {
    programs,
    skipped,
    totals: {
      programs: programs.length,
      tier2,
      programShare: share(tier2, programs.length),
      runs,
      tier2Runs,
      fallbacks,
      runShare: share(tier2Runs, runs),
      tier1Reasons: sorted(tier1),
      fallbackReasons: sorted(fallbackReasons),
    },
  };
}
