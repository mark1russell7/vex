/**
 * The sites of the fallbacks (roadmap item FALLBACKOPS). A probe compiles a program again with `generate` of
 * `@mark1russell7/vex-compiler`, and it changes each statement of the source that gives `FALLBACK`. The changed
 * statement records its site and then gives `FALLBACK`, as before. The probe operates only after a fallback of the
 * real tier 2, so the measured programs do not change.
 *
 * The probe reads the text of the printer (`js.ts` of the compiler). Thus a change of the printer can need a change
 * of the probe. The tests of `fallback-sites.test.ts` find such a change.
 */
import type { Expr, ExtHandler, RunOptions } from "@mark1russell7/vex";
import { FALLBACK, generate, load, type GenerateOptions, type LoopProgram, type LStmt } from "@mark1russell7/vex-compiler";

/** The site of one fallback. */
export interface FallbackSite {
  /** The check of the site, with the op or the extension that failed: for example `an op: divide`. */
  readonly site: string;
  /** The context of the site: the innermost block or loop of the generated code that contains it. */
  readonly context: string;
}

/** The probe of one program. */
export interface SiteProbe {
  /** This method runs the probe, and it gives the site of the `FALLBACK` of the run. */
  site(run: RunOptions): FallbackSite;
  /** This method runs the probe, and it gives the value of tier 2, with the site when the value is `FALLBACK`. */
  run(run: RunOptions): { readonly value: unknown; readonly site?: FallbackSite };
}

/** One statement of the source that gives `FALLBACK`. */
interface Stop {
  readonly reason: string;
  /** The local that the check reads, if the check reads a local. */
  readonly local: number | undefined;
  readonly context: string;
}

/** The functions of the recorder of the probe. The changed source reads them from the last constant. */
interface Recorder {
  readonly stop: (id: number) => typeof FALLBACK;
  readonly note: (id: number) => true;
  readonly thrown: (e: unknown) => typeof FALLBACK;
  readonly ext: (inner: ExtRule) => ExtRule;
}

/** The rule `ext` of the runtime of tier 2. */
type ExtRule = (kind: string, data: unknown, s: RunOptions["space"], origin: string, focus: string, path: readonly number[]) => unknown;

/** The context of a site at the top of the program. */
export const TOP = "at the top of the program";

/** This function gives the name of the op of each local that a site of an op assigns. */
function opLocals(program: LoopProgram): Map<number, string> {
  const ops = new Map<number, string>();
  const walk = (ss: readonly LStmt[]): void => {
    for (const s of ss) {
      switch (s.t) {
        case "let":
        case "set":
          if (s.value.t === "op") ops.set(s.n, String(program.constants[s.value.name]));
          break;
        case "if":
          walk(s.yes);
          walk(s.no);
          break;
        case "loop":
        case "block":
        case "repeat":
          walk(s.body);
          break;
        case "check":
        case "fail":
        case "break":
        case "next":
        case "push":
        case "return":
          break;
      }
    }
  };
  walk(program.body);
  return ops;
}

/** This function gives the number of spaces at the start of a line. */
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** This function gives the innermost block or loop of the body that contains the line at `at`. */
function contextOf(lines: readonly string[], at: number, body: number): string {
  let indent = indentOf(lines[at] ?? "");
  for (let i = at - 1; i >= body; i--) {
    const line = lines[i] ?? "";
    const ind = indentOf(line);
    if (ind >= indent || line.trim() === "") continue;
    indent = ind;
    const head = line.trim();
    if (/^L\d+: \{$/.test(head)) return "in a block that ends at an error (ifError, a binding of let, or a memo)";
    if (/^L\d+: for \(;;\) \{$/.test(head)) return "in the loop of iterate";
    if (/^L\d+: for \(/.test(head)) return "in an item of a list op";
  }
  return TOP;
}

/** The text of the statement that gives `FALLBACK`. */
const RETURN_F = "return F;";
/** The statement that ends a program with an error. The probe names its site too, so it can name each failed check. */
const RAISE = /return raise_\([^;]*;/;

/**
 * This function makes the probe of a program with the options of its compile. It gives `undefined` when the program
 * has no tier 2.
 */
export function siteProbe(expr: Expr, options: GenerateOptions = {}): SiteProbe | undefined {
  const g = generate(expr, options);
  if (!g.ok) return undefined;
  const ops = opLocals(g.program);
  const extensions: Readonly<Record<string, ExtHandler>> = options.extensions ?? {};
  const lines = g.source.split("\n");
  const body = lines.findIndex((l) => l.startsWith("return function vex("));
  const stops: Stop[] = [];
  const out = lines.map((line, i) => {
    if (i < body) return line.replace("const ext_ = R.ext;", "const ext_ = P_.ext(R.ext);");
    // The catch of the program: an exception stops it.
    if (line === "  } catch {" && lines[i + 1] === `    ${RETURN_F}`) return "  } catch (e) {";
    if (line === `    ${RETURN_F}` && lines[i - 1] === "  } catch {") return "    return P_.thrown(e);";
    const comment = /\/\/ (.*)$/.exec(line)?.[1];
    const read = /\bl(\d+) !== F\b/.exec(line)?.[1];
    const stop = (): string => {
      stops.push({
        reason: comment ?? "a construct that always gives an error",
        local: read === undefined ? undefined : Number(read),
        context: contextOf(lines, i, body),
      });
      return String(stops.length - 1);
    };
    if (RAISE.test(line)) return line.replace(RAISE, `return P_.stop(${stop()});`);
    if (line.includes(RETURN_F)) return line.replaceAll(RETURN_F, `return P_.stop(${stop()});`);
    // A check that ends a block or skips an item does not stop the program. The probe notes it.
    const check = comment === undefined ? null : /^(\s*if \(!\(.*?\)\)) (break L\d+;|continue L\d+;|\{ if \()/.exec(line);
    if (check === null) return line;
    const head = check[1] as string;
    return `${head.slice(0, -1)} && P_.note(${stop()}))${line.slice(head.length)}`;
  });
  // The last statement that gave FALLBACK, and the error of the last extension that gave FALLBACK.
  let last: { readonly stop: number } | { readonly thrown: unknown } | undefined;
  let lastExt: string | undefined;
  // The last check that failed and did not stop the program.
  let lastNote: number | undefined;
  const recorder: Recorder = {
    note: (id) => {
      lastNote = id;
      return true;
    },
    stop: (id) => {
      last = { stop: id };
      return FALLBACK;
    },
    thrown: (e) => {
      last = { thrown: e };
      return FALLBACK;
    },
    // The rule `ext` of the runtime, with a record of an extension that has no handler. The handlers record their errors.
    ext: (inner) => (kind, ...rest) => {
      if (!Object.hasOwn(extensions, kind)) lastExt = `${kind}, no handler`;
      return inner(kind, ...rest);
    },
  };
  /** The handlers of the extensions, each with a record of its error or its exception. */
  const recorded: Record<string, ExtHandler> = Object.fromEntries(
    Object.entries(extensions).map(([kind, handler]): [string, ExtHandler] => [
      kind,
      (data, ctx) => {
        try {
          const r = handler(data, ctx);
          if (!r.ok) lastExt = `${kind} gave ${r.error.code}`;
          return r;
        } catch (thrown) {
          lastExt = `${kind} threw`;
          throw thrown;
        }
      },
    ]),
  );
  /** This function gives the text of a check, with its op or the error of its extension. */
  const siteText = (stop: Stop): string => {
    const op = stop.local === undefined ? undefined : ops.get(stop.local);
    const detail = stop.reason === "an extension" ? lastExt : op;
    return detail === undefined ? stop.reason : `${stop.reason}: ${detail}`;
  };
  /** This function gives the site of the last statement that gave `FALLBACK`. */
  const siteOf = (): FallbackSite => {
    if (last === undefined) return { site: "no site", context: TOP };
    if ("thrown" in last) {
      const e = last.thrown;
      return { site: `an exception: ${e instanceof Error ? e.message : String(e)}`, context: TOP };
    }
    const stop = stops[last.stop] as Stop;
    if (stop.reason !== "a value of the memo") return { site: siteText(stop), context: stop.context };
    // The memo keeps the error of its node. The last failed check of this run made it, or else an earlier run made it.
    const note = lastNote === undefined ? "an error of an earlier run" : siteText(stops[lastNote] as Stop);
    return { site: `${stop.reason}, after ${note}`, context: stop.context };
  };
  const source = [out[0], `const P_ = K[${String(g.program.constants.length)}];`, ...out.slice(1)].join("\n");
  const fast = load({ ...g, source, options: { ...g.options, extensions: recorded }, program: { ...g.program, constants: [...g.program.constants, recorder] } });
  const run = (r: RunOptions): { readonly value: unknown; readonly site?: FallbackSite } => {
    last = undefined;
    lastExt = undefined;
    lastNote = undefined;
    const value = fast(r.space, r.origin, r.vars, r.tables);
    return value === FALLBACK ? { value, site: siteOf() } : { value };
  };
  return {
    site: (r) => run(r).site ?? { site: "the probe gave a value", context: TOP },
    run,
  };
}
