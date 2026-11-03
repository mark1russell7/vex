/**
 * The share of tier 2 on real programs (roadmap item FALLBACKSHARE). This module compiles programs with `tiered` of
 * `@mark1russell7/vex-compiler`. It counts the runs that tier 2 finishes with a value or with an error, and the runs that
 * tier 1 does again after a `FALLBACK`. It is a measurement, not a gate. With the option `sites`, it also finds the site of each fallback
 * (FALLBACKOPS).
 */
import type { CompileFn, Expr, Program, Result } from "@mark1russell7/vex";
import { tiered, type GenerateOptions } from "@mark1russell7/vex-compiler";
import { siteProbe, type SiteProbe } from "./fallback-sites.ts";

/** A reason and the number of times that it occurs. */
export interface ReasonCount {
  readonly reason: string;
  readonly count: number;
}

/** A site of the fallbacks, the number of its runs, the programs of these runs and the first run. */
export interface SiteCount extends ReasonCount {
  /** The programs of the runs, by count, largest first. */
  readonly programs: readonly ReasonCount[];
  /** The first run of the site: the name of the program and the origin of the run. */
  readonly example: string;
}

/** The options of a measurement. */
export interface ShareOptions {
  /**
   * With `sites`, a probe finds the site of each fallback (`fallback-sites.ts`). The probe operates after the fallback,
   * so the counts do not change.
   */
  readonly sites?: boolean;
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
  /** The number of runs where tier 2 gave no result, so tier 1 gave it. */
  readonly fallbacks: number;
  /** The number of runs with a value, not an error. */
  readonly values: number;
  /** The number of runs where tier 2 gave the value. A program of tier 1 has 0. */
  readonly tier2Values: number;
  /** The number of runs where tier 2 gave the error. A program of tier 1 has 0. */
  readonly tier2Errors: number;
  /** The result of tier 1 on each run after a `FALLBACK`, by count, largest first. */
  readonly fallbackReasons: readonly ReasonCount[];
  /** With the option `sites`: the site and the context of each fallback where tier 1 gave a value, by count. */
  readonly valueSites?: readonly ReasonCount[];
  /** With the option `sites`: the site of each fallback where tier 1 gave an error, by count. */
  readonly errorSites?: readonly ReasonCount[];
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
  /** The number of runs that tier 2 finished: with a value or with an error. */
  readonly tier2Runs: number;
  readonly fallbacks: number;
  /** The runs that tier 2 finished divided by the runs. A run of a program of tier 1 is not a run of tier 2. */
  readonly runShare: number;
  /**
   * The runs where tier 2 gave the value divided by the runs. This field keeps the first meaning of `runShare`, from the
   * time when tier 2 gave no error. Compare it with the `runShare` of an older record.
   */
  readonly valueRunShare: number;
  /** The number of runs where tier 2 gave the error, in the programs of tier 2. */
  readonly tier2ErrorRuns: number;
  /** The runs where tier 2 gave the error divided by the runs with an error. */
  readonly errorShare: number;
  /** The number of runs with a value, not an error. */
  readonly valueRuns: number;
  /** The number of runs where tier 2 gave the value, in the programs of tier 2. */
  readonly tier2ValueRuns: number;
  /** The runs where tier 2 gave the value divided by the runs with a value. */
  readonly valueShare: number;
  /** The reasons of the programs of tier 1, by count of programs, largest first. */
  readonly tier1Reasons: readonly ReasonCount[];
  /** The results of tier 1 after a `FALLBACK`, by count of runs, largest first. */
  readonly fallbackReasons: readonly ReasonCount[];
  /** With the option `sites`: the sites of the fallbacks where tier 1 gave a value, with their context, by count of runs. */
  readonly valueSites?: readonly SiteCount[];
  /** With the option `sites`: the sites of the fallbacks where tier 1 gave an error, by count of runs. */
  readonly errorSites?: readonly SiteCount[];
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
  values: number;
  tier2Values: number;
  tier2Errors: number;
  readonly reasons: Map<string, number>;
  readonly valueSites: Map<string, number>;
  readonly errorSites: Map<string, number>;
}

/** One fallback with its site. A value fallback is a fallback where tier 1 gave a value. */
interface SiteRun {
  readonly value: boolean;
  readonly site: string;
  readonly program: string;
  readonly origin: string;
}

/** The runs of one site: the count of each program, and the first run. */
interface SiteTally {
  readonly programs: Map<string, number>;
  readonly example: string;
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

/** This function adds one run to the tally of its site. */
function addSite(sites: Map<string, SiteTally>, run: SiteRun): void {
  let t = sites.get(run.site);
  if (t === undefined) {
    t = { programs: new Map(), example: `${run.program} at the origin ${JSON.stringify(run.origin)}` };
    sites.set(run.site, t);
  }
  add(t.programs, run.program);
}

/** This function gives the sites as a list, largest first. */
function sortedSites(sites: ReadonlyMap<string, SiteTally>): SiteCount[] {
  const counts = new Map([...sites].map(([site, t]) => [site, [...t.programs.values()].reduce((a, b) => a + b, 0)]));
  return sorted(counts).map((r) => {
    const t = sites.get(r.reason) as SiteTally;
    return { ...r, programs: sorted(t.programs), example: t.example };
  });
}

/** This function gives a meter that counts into `tallies`. With `sites`, a probe finds the site of each fallback. */
function meterOf(tallies: Map<string, Tally>, sites: SiteRun[] | undefined): Meter {
  const program = (name: string, source: Expr, options: GenerateOptions = {}): Program => {
    const p = tiered(source, options);
    // The probe compiles the program again, so the meter makes it at the first fallback.
    let probe: SiteProbe | undefined;
    let t = tallies.get(name);
    if (t === undefined) {
      t = { tier: p.tier, reason: p.reason, compiles: 0, runs: 0, fallbacks: 0, values: 0, tier2Values: 0, tier2Errors: 0, reasons: new Map(), valueSites: new Map(), errorSites: new Map() };
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
        const fellBack = p.stats.fallbacks > before;
        if (result.ok) tally.values++;
        if (p.tier === 2 && !fellBack) {
          if (result.ok) tally.tier2Values++;
          else tally.tier2Errors++;
        }
        if (fellBack) {
          tally.fallbacks++;
          add(tally.reasons, fallbackReason(result));
          if (sites !== undefined) {
            probe ??= siteProbe(p.expr, options);
            const found = probe?.site(r) ?? { site: "no probe", context: "" };
            // A value fallback names the context too: the context tells why tier 1 gives a value.
            const site = result.ok ? `${found.site}, ${found.context}` : found.site;
            add(result.ok ? tally.valueSites : tally.errorSites, site);
            sites.push({ value: result.ok, site, program: name, origin: r.origin });
          }
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
export function measureShare(cases: readonly ShareCase[], options: ShareOptions = {}): ShareReport {
  const programs: ProgramShare[] = [];
  const skipped: SkippedProgram[] = [];
  const withSites = options.sites === true;
  const valueSites = new Map<string, SiteTally>();
  const errorSites = new Map<string, SiteTally>();
  for (const c of cases) {
    const tallies = new Map<string, Tally>();
    const sites: SiteRun[] | undefined = withSites ? [] : undefined;
    try {
      c.run(meterOf(tallies, sites));
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      const names = tallies.size === 0 ? [c.name] : [...tallies.keys()];
      for (const name of names) skipped.push({ name, reason });
      continue;
    }
    for (const run of sites ?? []) addSite(run.value ? valueSites : errorSites, run);
    for (const [name, t] of tallies) {
      programs.push({
        name,
        tier: t.tier,
        ...(t.reason === undefined ? {} : { reason: t.reason }),
        compiles: t.compiles,
        runs: t.runs,
        fallbacks: t.fallbacks,
        values: t.values,
        // A name with compiles of two tiers counts as tier 1.
        tier2Values: t.tier2Values,
        tier2Errors: t.tier2Errors,
        fallbackReasons: sorted(t.reasons),
        ...(withSites ? { valueSites: sorted(t.valueSites), errorSites: sorted(t.errorSites) } : {}),
      });
    }
  }
  const tier1 = new Map<string, number>();
  const fallbackReasons = new Map<string, number>();
  let runs = 0;
  let tier2Runs = 0;
  let fallbacks = 0;
  let valueRuns = 0;
  let tier2ValueRuns = 0;
  let tier2ErrorRuns = 0;
  for (const p of programs) {
    runs += p.runs;
    valueRuns += p.values;
    tier2ValueRuns += p.tier2Values;
    tier2ErrorRuns += p.tier2Errors;
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
      valueRunShare: share(tier2ValueRuns, runs),
      tier2ErrorRuns,
      errorShare: share(tier2ErrorRuns, runs - valueRuns),
      valueRuns,
      tier2ValueRuns,
      valueShare: share(tier2ValueRuns, valueRuns),
      tier1Reasons: sorted(tier1),
      fallbackReasons: sorted(fallbackReasons),
      ...(withSites ? { valueSites: sortedSites(valueSites), errorSites: sortedSites(errorSites) } : {}),
    },
  };
}
