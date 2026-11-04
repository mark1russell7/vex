/**
 * The check of the steps of `fix` (FIX.MONOTONE). The check proves from the kinds of the ops that the step of each `fix`
 * does not fall when the last round rises. The rounds then reach the least fixed point above `init`, and the dual
 * for `and` and `min`. A program without a proof does not run (fail closed).
 *
 * The proof follows the reads of `last` through the program. Each part has a direction: it does not depend on the last
 * round, it follows the last round, or it moves against the last round. An op states the direction of each argument
 * as data (FIX.OPS). A part that the rules do not cover and that reads `last` ends the check with a reason.
 */
import type { AnyDomain, Monotone, OpSpec, ReturnKind } from "./domain.ts";
import { joinKind } from "./fix.ts";
import { addrExprs, axisExprs, children, type Axis, type Expr, type ExprOf } from "./ir.ts";

/** The options of the check: the domains and the functions of the host, as the options of a compilation give them. */
export interface MonotoneOptions {
  readonly domains?: readonly AnyDomain[];
  readonly fns?: Readonly<Record<string, unknown>>;
}

/** The direction of a part: 1 follows the last round, -1 moves against it, and 0 does not read it. */
type Direction = -1 | 0 | 1;

/** What the check knows of a part: its direction, and the kind of its value if the check knows it. */
interface Flow {
  readonly dir: Direction;
  readonly tag: "boolean" | "number" | "list" | undefined;
}

/** A rule of an op: the direction of each argument, and the kind of the result. */
interface Rule {
  readonly args: readonly Monotone[];
  readonly returns: ReturnKind | undefined;
}

/** The names of a program and the flow of each. A name that the map does not have does not read the last round. */
type Names = ReadonlyMap<string, Flow>;

/** The end of a proof. The methods of `Proof` throw it, and `monotoneError` gives its reason. */
class Refusal {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }
}

const STEADY: Flow = { dir: 0, tag: undefined };

/**
 * The rules of the list ops. The items of a list come from an axis that does not read the last round, so the set of
 * the items stays the same in each round. Each of these ops ignores the order of the items. `sum` has no rule. The
 * rounding of a sum of floats depends on the order of the items (FIX.ORDER).
 */
const LIST_RULES: Readonly<Record<string, Rule>> = {
  any: { args: ["up"], returns: "boolean" },
  all: { args: ["up"], returns: "boolean" },
  none: { args: ["down"], returns: "boolean" },
  min: { args: ["up"], returns: "number" },
  max: { args: ["up"], returns: "number" },
};

/** This function gives the flow of a literal. The kind of a number or a boolean is known. */
function steadyValue(value: unknown): Flow {
  if (typeof value === "number") return { dir: 0, tag: "number" };
  return typeof value === "boolean" ? { dir: 0, tag: "boolean" } : STEADY;
}

/** This function gives the axis inside the `where` axes of an axis. */
const baseOf = (a: Axis): Axis => (a.t === "where" ? baseOf(a.axis) : a);

/** This function gives the names without the names that a part of the program hides. */
function without(names: Names, hidden: readonly string[]): Names {
  const out = new Map(names);
  for (const name of hidden) out.delete(name);
  return out;
}

/** The proof of the step of one `fix`. */
class Proof {
  readonly #fix: ExprOf<"fix">;
  readonly #domains: readonly AnyDomain[];
  readonly #fns: Readonly<Record<string, unknown>>;
  /** This field is `true` inside a `fix` of the same name: a read there reads that `fix`. */
  #hidden = false;

  constructor(fix: ExprOf<"fix">, opts: MonotoneOptions) {
    this.#fix = fix;
    this.#domains = opts.domains ?? [];
    this.#fns = opts.fns ?? {};
  }

  /** This method proves the step. It throws a refusal, or it returns. */
  prove(): void {
    if (this.#flow(this.#fix.step, new Map()).dir < 0) this.#refuse("it moves against the last round");
  }

  #refuse(why: string): never {
    throw new Refusal(`the step of the "fix" "${this.#fix.name}" does not move one way: ${why}`);
  }

  #flow(e: Expr, names: Names): Flow {
    switch (e.tag) {
      case "lit":
        return steadyValue(e.value);
      case "var":
        return names.get(e.name) ?? STEADY;
      case "last":
        return e.name === this.#fix.name && !this.#hidden ? { dir: 1, tag: joinKind(this.#fix.join) } : STEADY;
      case "let": {
        const bound = new Map(names);
        for (const [name, x] of Object.entries(e.bind)) bound.set(name, this.#flow(x, names));
        return this.#flow(e.body, bound);
      }
      case "fn":
        return this.#flow(e.body, without(names, e.params));
      case "call":
        if ((names.get(e.fn)?.dir ?? 0) !== 0) this.#refuse(`the function "${e.fn}" reads the last round`);
        return this.#steady(e.args, names, `an argument of the function "${e.fn}"`);
      case "each":
        return this.#each(e, names);
      case "app":
        return this.#app(e, names);
      case "fix":
        return this.#inner(e, names);
      // The fields of a record, the moves of a reference and the parts of a fold and of an iterate have no rule.
      case "rec":
      case "ref":
      case "fold":
      case "iterate":
      case "ext":
        return this.#steady(children(e), names, `a node "${e.tag}"`);
    }
  }

  /** This method refuses a part that reads the last round. Only an op or a loop with a rule can take such a part. */
  #steady(parts: readonly Expr[], names: Names, what: string): Flow {
    for (const x of parts) if (this.#flow(x, names).dir !== 0) this.#refuse(`${what} reads the last round`);
    return STEADY;
  }

  /**
   * This method reads a `fix` inside the step. Its rounds end in each round of the outer `fix`. Thus a column of the
   * outer `fix` as an input of the inner `fix` has no proof.
   */
  #inner(e: ExprOf<"fix">, names: Names): Flow {
    this.#steady([e.init], names, `the start of the "fix" "${e.name}"`);
    const outer = this.#hidden;
    this.#hidden ||= e.name === this.#fix.name;
    this.#steady([e.step], names, `the step of the "fix" "${e.name}"`);
    this.#hidden = outer;
    return { dir: 0, tag: joinKind(e.join) };
  }

  /** This method reads an `each`. The targets must not read the last round, so each round has the same items. */
  #each(e: ExprOf<"each">, names: Names): Flow {
    this.#steady([...axisExprs(e.axis), ...addrExprs(e.at)], names, "an axis");
    const body = this.#flow(e.body, without(names, e.as ?? []));
    if (body.dir !== 0 && baseOf(e.axis).t === "table") this.#refuse("the axis table leaves the rows of the column");
    return { dir: body.dir, tag: "list" };
  }

  #app(e: ExprOf<"app">, names: Names): Flow {
    const flows = e.args.map((x) => this.#flow(x, names));
    const [head] = flows;
    switch (e.op) {
      case "if":
        if ((head?.dir ?? 0) !== 0) this.#refuse('the test of "if" reads the last round');
        return this.#joined(flows.slice(1), e.op);
      case "and":
      case "or":
      case "ifError":
        return this.#joined(flows, e.op);
    }
    if (flows.every((x) => x.dir === 0)) return STEADY;
    const rule = this.#rule(e.op, head?.tag);
    const moves = flows.map((x, i): number => {
      const move = rule.args[i];
      if (x.dir !== 0 && move === undefined) this.#refuse(`the argument ${String(i + 1)} of the op "${e.op}" reads the last round`);
      return move === "down" ? -x.dir : x.dir;
    });
    const { returns } = rule;
    return { dir: this.#one(moves, e.op), tag: returns === "number" || returns === "boolean" ? returns : undefined };
  }

  /** This method gives the flow of the branches of a form. Each branch can be the result. */
  #joined(flows: readonly Flow[], op: string): Flow {
    const [head] = flows;
    const dir = this.#one(
      flows.map((x) => x.dir),
      op,
    );
    return { dir, tag: flows.every((x) => x.tag === head?.tag) ? head?.tag : undefined };
  }

  /** This method gives the one direction of the moves of a node. Two directions have no proof. */
  #one(moves: readonly number[], op: string): Direction {
    const up = moves.some((m) => m > 0);
    if (up && moves.some((m) => m < 0)) this.#refuse(`the op "${op}" reads the last round in both directions`);
    return up ? 1 : moves.some((m) => m < 0) ? -1 : 0;
  }

  /**
   * This method gives the rule of an op for a receiver of a known kind, in the order of the interpreter. A list op on a
   * list comes first, then the domains in order, then a function of the host. A receiver of another kind has no rule.
   */
  #rule(op: string, tag: Flow["tag"]): Rule {
    if (tag === undefined) this.#refuse(`the kind of the first argument of the op "${op}" does not decide the op. Put an argument of a known kind first`);
    if (tag === "list") return Object.hasOwn(LIST_RULES, op) ? (LIST_RULES[op] as Rule) : this.#noRule(op);
    const found: Rule[] = [];
    for (const d of this.#domains) {
      if (d.primitive !== undefined && d.primitive !== tag) continue;
      const spec = Object.hasOwn(d.ops, op) ? (d.ops[op] as OpSpec<unknown>) : undefined;
      if (spec?.fn === undefined) continue;
      found.push(this.#declared(spec, op));
      if (d.primitive === tag) return this.#same(found, op);
    }
    if (Object.hasOwn(this.#fns, op)) found.push(this.#declared(this.#fns[op] as Pick<OpSpec<unknown>, "monotone" | "returns">, op));
    return found.length > 0 ? this.#same(found, op) : this.#noRule(op);
  }

  #declared(spec: Pick<OpSpec<unknown>, "monotone" | "returns">, op: string): Rule {
    return spec.monotone === undefined ? this.#noRule(op) : { args: spec.monotone, returns: spec.returns };
  }

  /** This method gives the rule of the ops that can apply. They must have the same rule, because the data decides among them. */
  #same(rules: readonly Rule[], op: string): Rule {
    const first = rules[0] as Rule;
    if (rules.some((r) => r.args.join() !== first.args.join())) this.#refuse(`the op "${op}" has two rules, and the data decides among them`);
    return first;
  }

  #noRule(op: string): never {
    this.#refuse(`the op "${op}" has no rule of direction`);
  }
}

/** This function walks a program. `open` has the names of the `fix` nodes around a node (FIX.LAST). */
function walk(e: Expr, open: ReadonlySet<string>, opts: MonotoneOptions): void {
  if (e.tag === "last" && !open.has(e.name)) throw new Refusal(`the read "last" of "${e.name}" has no "fix" of that name around it`);
  if (e.tag !== "fix") {
    for (const x of children(e)) walk(x, open, opts);
    return;
  }
  walk(e.init, open, opts);
  walk(e.step, new Set([...open, e.name]), opts);
  new Proof(e, opts).prove();
}

/** This function gives the reason that a program breaks a rule of `fix`, or `undefined` for a program that keeps them (FIX.LAST, FIX.MONOTONE). */
export function monotoneError(e: Expr, opts: MonotoneOptions): string | undefined {
  try {
    walk(e, new Set(), opts);
    return undefined;
  } catch (thrown) {
    // Stryker disable next-line ConditionalExpression: only a Refusal comes here, and a mutant that always takes it reads its field
    if (thrown instanceof Refusal) return thrown.reason;
    throw thrown;
  }
}
