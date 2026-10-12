/**
 * The law checker. A domain declares laws for its ops (`commutative`, `associative`, `idempotent`, and an
 * `identity`). The law checker turns each claim into a fast-check property. A false claim gives a
 * counterexample.
 */
import { resolveOp, type AnyDomain, type Law } from "@mark1russell7/vex";
import * as fc from "fast-check";

/** The options of the law checker. */
export interface LawOptions<D> {
  /** The values of the domain. Use values that make the laws exact, for example integers for float ops. */
  readonly arb: fc.Arbitrary<D>;
  /** The equality of values. The default compares the structure. */
  readonly eq?: (a: unknown, b: unknown) => boolean;
  /** The number of runs of each property. The default is 200. */
  readonly numRuns?: number;
}

/** The result of one law check. */
export interface LawResult {
  readonly name: string;
  readonly ok: boolean;
  /** The counterexample and the error message, for a failed check. */
  readonly message?: string;
}

/** One law property of one op. */
export interface LawProperty {
  /** The name, for example `Vec2.add commutative`. */
  readonly name: string;
  /** This function runs the property and gives the result. */
  readonly check: (numRuns: number) => LawResult;
}

function lawProperty<Ts extends [unknown, ...unknown[]]>(name: string, property: fc.IPropertyWithHooks<Ts>): LawProperty {
  return {
    name,
    check: (numRuns: number): LawResult => {
      // fast-check gives a report message only for a failed run. The report does not give the error that the
      // property threw, so the message adds it: for example the name of an op that the values do not have.
      const details = fc.check(property, { numRuns });
      const message = fc.defaultReportMessage(details);
      if (message === undefined) return { name, ok: true };
      // A failed run has an error. A property can also throw a value that is not an Error, for example a text.
      const cause = details.errorInstance instanceof Error ? details.errorInstance.message : String(details.errorInstance);
      return { name, ok: false, message: `${message}\nCause: ${cause}` };
    },
  };
}

/** This function compares two values by structure: primitives with `Object.is`, objects by their fields. */
export function structuralEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && structuralEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** This function calls op `name` of `domain` with `self` and `args`. It throws if the domain has no such op. */
function call(domain: AnyDomain, name: string, self: unknown, args: readonly unknown[]): unknown {
  const op = resolveOp(domain, self, name);
  if (op === undefined) throw new Error(`${domain.name} has no op "${name}" for the value`);
  return op.call(args);
}

const lawsOf = (domain: AnyDomain, name: string): readonly Law[] => (domain.ops[name] as { laws?: readonly Law[] } | undefined)?.laws ?? [];

/** This function gives one property for each law that the ops of `domain` declare. */
export function lawProperties<D>(domain: AnyDomain, opts: LawOptions<D>): readonly LawProperty[] {
  const eq = opts.eq ?? structuralEqual;
  const out: LawProperty[] = [];
  for (const name of Object.keys(domain.ops)) {
    const laws = lawsOf(domain, name);
    const label = `${domain.name}.${name}`;
    for (const law of laws) {
      if (law === "commutative") {
        out.push(lawProperty(`${label} commutative`, fc.property(opts.arb, opts.arb, (a, b) => eq(call(domain, name, a, [b]), call(domain, name, b, [a])))));
      } else if (law === "associative") {
        out.push(
          lawProperty(`${label} associative`, fc.property(opts.arb, opts.arb, opts.arb, (a, b, c) => eq(call(domain, name, call(domain, name, a, [b]), [c]), call(domain, name, a, [call(domain, name, b, [c])])))),
        );
      } else {
        out.push(lawProperty(`${label} idempotent`, fc.property(opts.arb, (a) => eq(call(domain, name, a, [a]), a))));
      }
    }
    const identity = (domain.ops[name] as { identity?: () => unknown } | undefined)?.identity;
    if (identity !== undefined) {
      out.push(lawProperty(`${label} identity`, fc.property(opts.arb, (a) => eq(call(domain, name, a, [identity()]), a) && eq(call(domain, name, identity(), [a]), a))));
    }
  }
  return out;
}

/** This function checks each declared law of `domain`. It gives one result for each law, and does not throw. */
export function checkLaws<D>(domain: AnyDomain, opts: LawOptions<D>): readonly LawResult[] {
  return lawProperties(domain, opts).map((p) => p.check(opts.numRuns ?? 200));
}

/** This function checks each declared law of `domain`, and throws an error that lists the failed laws. */
export function assertLaws<D>(domain: AnyDomain, opts: LawOptions<D>): void {
  const failed = checkLaws(domain, opts).filter((r) => !r.ok);
  if (failed.length > 0) throw new Error(failed.map((r) => [r.name, r.message].join(": ")).join("\n\n"));
}
