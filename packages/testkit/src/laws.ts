/**
 * The law checker. A domain declares laws for its ops (`commutative`, `associative`, `idempotent`, and an
 * `identity`). The law checker turns each claim into a fast-check property. A false claim gives a
 * counterexample. It also checks the kinds that a domain declares for a compiler. These are the primitive type of its
 * values (KIND.PRIMITIVE) and the kind of the result of each op (KIND.RETURNS).
 */
import { resolveOp, type AnyDomain, type Law, type OpSpec, type ParamKind, type ReturnKind } from "@mark1russell7/vex";
import * as fc from "fast-check";

/** The options of the law checker. */
export interface LawOptions<D> {
  /** The values of the domain. Use values that make the laws exact, for example integers for float ops. */
  readonly arb: fc.Arbitrary<D>;
  /** The equality of values. The default compares the structure. */
  readonly eq?: (a: unknown, b: unknown) => boolean;
  /** The number of runs of each property. The default is 200. */
  readonly numRuns?: number;
  /**
   * The domains of the kinds `domain:Name` of `returns`. The checker checks such a result only when this list has the
   * domain with that name.
   */
  readonly domains?: readonly AnyDomain[];
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

/** This function gives the domain of a kind `domain:Name`: the domain itself, or the domain of `others` with that name. */
const domainOfKind = (domain: AnyDomain, kind: ReturnKind, others: readonly AnyDomain[]): AnyDomain | undefined =>
  [domain, ...others].find((d) => kind === `domain:${d.name}`);

/**
 * This function tells if a value has a kind. A value of the kind `domain` is a value of the domain. A value of the kind
 * `domain:Name` is a value of the domain `Name` of `others`.
 */
function hasKind(domain: AnyDomain, kind: ReturnKind, u: unknown, others: readonly AnyDomain[]): boolean {
  const named = domainOfKind(domain, kind, others);
  if (named !== undefined) return named.is(u);
  switch (kind as ParamKind) {
    case "domain":
      return domain.is(u);
    case "any":
      return true;
    case "number":
    case "string":
    case "boolean":
      return typeof u === kind;
  }
}

/** This function gives the values of a parameter of a kind. */
function argsOf<D>(kind: ParamKind, arb: fc.Arbitrary<D>): fc.Arbitrary<unknown> {
  switch (kind) {
    case "domain":
      return arb;
    case "any":
      return fc.anything();
    case "number":
      return fc.double();
    case "string":
      return fc.string({ maxLength: 6 });
    case "boolean":
      return fc.boolean();
  }
}

/**
 * This function gives the property of `returns`: each result of the op has the declared kind. The interpreter does
 * not accept some results, for example `undefined` or a number that is not finite. Such a result is an error of Vex,
 * so it does not count. An exception is the error `#CALC!`, so it does not count either.
 */
function returnsProperty<D>(domain: AnyDomain, name: string, spec: OpSpec<unknown>, kind: ReturnKind, arb: fc.Arbitrary<D>, others: readonly AnyDomain[]): LawProperty {
  // Without params, each argument is a value of the domain, one for each parameter of the function after the receiver.
  const kinds: readonly ParamKind[] = spec.params ?? Array.from({ length: Math.max(0, (spec.fn?.length ?? 1) - 1) }, (): ParamKind => "domain");
  const args = fc.tuple(...kinds.map((k) => argsOf(k, arb)));
  return lawProperty(
    `${domain.name}.${name} returns ${kind}`,
    fc.property(arb, args, (self, xs) => {
      let r: unknown;
      try {
        r = call(domain, name, self, xs);
      } catch {
        return true;
      }
      return r === undefined || r === null || (typeof r === "number" && !Number.isFinite(r)) || hasKind(domain, kind, r, others);
    }),
  );
}

/** This function gives one property for each law that the ops of `domain` declare. */
export function lawProperties<D>(domain: AnyDomain, opts: LawOptions<D>): readonly LawProperty[] {
  const eq = opts.eq ?? structuralEqual;
  const out: LawProperty[] = [];
  const primitive = domain.primitive;
  if (primitive !== undefined) {
    // The domain accepts each value of its type, and no other value: also the values of the domain arbitrary.
    const values = fc.oneof(fc.anything(), opts.arb, fc.double(), fc.string({ maxLength: 4 }), fc.boolean());
    out.push(lawProperty(`${domain.name} primitive ${primitive}`, fc.property(values, (u) => domain.is(u) === (typeof u === primitive))));
  }
  for (const name of Object.keys(domain.ops)) {
    // An entry of the op table can be undefined. It declares nothing.
    const spec = domain.ops[name] as OpSpec<unknown> | undefined;
    // A result of another domain needs that domain in the option domains.
    const others = opts.domains ?? [];
    if (spec?.returns !== undefined && (!spec.returns.startsWith("domain:") || domainOfKind(domain, spec.returns, others) !== undefined)) out.push(returnsProperty(domain, name, spec, spec.returns, opts.arb, others));
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
