/**
 * The texts of the errors of the nodes of a program. The interpreter and the materialize step of the compiler use them.
 * Thus tier 1 and tier 2 give the same error (docs/COMPILER.md §4.1).
 */
import type { ParamKind } from "./domain.ts";
import { vexError, type ErrorKind, type VexError } from "./errors.ts";
import { isVexList } from "./list.ts";
import type { Position } from "./space.ts";

/** The part of an error that does not depend on the position of its node: the kind, the sentence and the op name. */
export interface ErrorText {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly op?: string;
}

/** This function gives a short name for the type of a value, for error messages. */
export function describeType(u: unknown): string {
  if (u === null) return "null";
  if (Array.isArray(u)) return "array";
  if (isVexList(u)) return "list";
  if (typeof u === "object") {
    const name = (Object.getPrototypeOf(u) as { constructor?: { name?: unknown } } | null)?.constructor?.name;
    return typeof name === "string" && name !== "Object" ? name : "object";
  }
  return typeof u;
}

/** The texts of the errors. Each function takes the facts of the error that do not come from the position of its node. */
export const errorText = {
  /** A name without a binding (`var`). */
  unbound: (name: string): ErrorText => ({ kind: "unbound", message: `the name "${name}" has no binding` }),
  /** A read of a function as a value (FN.VALUE). */
  functionValue: (name: string): ErrorText => ({ kind: "kind-mismatch", message: `the name "${name}" is a function, not a value` }),
  /** A call of a name without a binding (FN.CALL). */
  noFunction: (name: string): ErrorText => ({ kind: "unbound", message: `the function "${name}" has no binding` }),
  /** A call of a name that holds a value (FN.CALL). */
  notFunction: (name: string): ErrorText => ({ kind: "kind-mismatch", message: `the name "${name}" is a value, not a function` }),
  /** A call with the wrong number of arguments (FN.CALL). */
  arity: (name: string, params: number, args: number): ErrorText => ({ kind: "bad-expression", message: `the function "${name}" takes ${String(params)} arguments, not ${String(args)}` }),
  /** An extension kind without a handler. */
  noHandler: (kind: string): ErrorText => ({ kind: "unknown-op", message: `no handler for the extension kind "${kind}"` }),
  /** An exception of an op, of an extension or of `fromScalar`. */
  threw: (op: string): ErrorText => ({ kind: "threw", message: `"${op}" threw an exception`, op }),
  /** A reference that reads no value. `where` is the part of the path that failed. */
  missing: (key: string, where: string): ErrorText => ({ kind: "missing-field", message: `the record at "${key}" has no value at "${where}"` }),
  /** A reference whose getter threw. */
  readThrew: (key: string, where: string): ErrorText => ({ kind: "threw", message: `reading "${where}" at "${key}" threw an exception` }),
  /** Two or more arguments or fields that failed (CALL.ARGS, REC.FIELDS). */
  args: (count: number, what: string): ErrorText => ({ kind: "args", message: `${String(count)} ${what} failed` }),
  /** The axis table of an evaluation without that table. */
  noTable: (name: string): ErrorText => ({ kind: "no-table", message: `the evaluation has no table "${name}"` }),
  /** The test `until` of `iterate`, with a value that is not a boolean. */
  untilKind: (value: unknown): ErrorText => ({ kind: "kind-mismatch", message: `the test "until" of "iterate" gave a ${typeof value}, not a boolean` }),
  /** The limit of `iterate` with a test that is not true. */
  limit: (limit: number): ErrorText => ({ kind: "limit", message: `"iterate" made its ${String(limit)} steps, and its test "until" is not true` }),
  /** The test of `where`, with a value that is not a boolean. */
  whereKind: (value: unknown): ErrorText => ({ kind: "kind-mismatch", message: `the test of "where" gave a ${typeof value}, not a boolean` }),
  /** A domain that accepts the receiver of an op and has no such op. */
  domainNoOp: (domain: string, op: string): ErrorText => ({ kind: "unknown-op", message: `the domain "${domain}" has no op "${op}"`, op }),
  /** An op without arguments and without a free function. */
  noOp: (op: string): ErrorText => ({ kind: "unknown-op", message: `there is no function "${op}"`, op }),
  /** An op whose receiver no domain accepts. */
  noDomain: (op: string, self: unknown): ErrorText => ({ kind: "not-instance", message: `no domain accepts the receiver of "${op}" (${describeType(self)})`, op }),
  /** A special form without the argument at the index `i`. */
  needsArgument: (op: string, i: number): ErrorText => ({ kind: "bad-expression", message: `"${op}" needs argument ${String(i + 1)}`, op }),
  /** `and` or `or` without arguments. */
  needsArguments: (op: string): ErrorText => ({ kind: "bad-expression", message: `"${op}" needs at least 1 argument`, op }),
  /** An argument of a special form that is not a boolean. */
  notBoolean: (op: string, i: number, value: unknown): ErrorText => ({ kind: "kind-mismatch", message: `argument ${String(i + 1)} of "${op}" is a ${describeType(value)}, not a boolean`, op }),
  /** An argument of an op that does not have the kind of its parameter. */
  badParam: (op: string, i: number, value: unknown, kind: ParamKind, domain: string): ErrorText => ({
    kind: kind === "domain" ? "not-instance" : "kind-mismatch",
    message: `argument ${String(i + 1)} of "${op}" is a ${describeType(value)}, not a ${kind === "domain" ? domain : kind}`,
    op,
  }),
  /** An op that gave `undefined` or `null`. */
  noValue: (op: string): ErrorText => ({ kind: "undefined-result", message: `"${op}" gave no value`, op }),
  /** An op that gave a number that is not finite. */
  notFinite: (op: string, value: number): ErrorText => ({ kind: "not-finite", message: `"${op}" gave ${String(value)}`, op }),
  /** An op that gave a value that its domain does not accept as valid. */
  invalid: (op: string, domain: string): ErrorText => ({ kind: "invalid-value", message: `"${op}" gave a value that is not a valid ${domain}`, op }),
  /** A check `valid` of a domain that threw. */
  validThrew: (op: string, domain: string): ErrorText => ({ kind: "threw", message: `the "valid" check of "${domain}" threw an exception`, op }),
  /** A list op whose items must have one kind, with an item of another kind. */
  needsItems: (op: string, what: "numbers" | "booleans", item: unknown): ErrorText => ({ kind: "kind-mismatch", message: `"${op}" needs ${what}, but an item is a ${describeType(item)}`, op }),
  /** A list op that has no items to work with. */
  empty: (op: string): ErrorText => ({ kind: "empty", message: `"${op}" has no values to work with`, op }),
  /** `reduce` with an op name that is not a text. */
  reduceName: (name: unknown): ErrorText => ({ kind: "kind-mismatch", message: `"reduce" needs an op name, but got a ${describeType(name)}`, op: "reduce" }),
  /** A step of `reduce` or of `sortBy` that no domain gives. */
  noStep: (op: string, value: unknown): ErrorText => ({ kind: "unknown-op", message: `no domain gives "${op}" for a ${describeType(value)}`, op }),
} as const;

/** The details of an error that come from its evaluation, and not from its text. */
export interface ErrorExtra {
  readonly causes?: readonly VexError[];
  readonly thrown?: unknown;
}

/** This function makes the error of a text at a node: the path of the node, with its origin and its focus. */
export function errorAt(t: ErrorText, pos: Position, path: readonly number[], extra: ErrorExtra = {}): VexError {
  return vexError(t.kind, t.message, { path, origin: pos.origin, focus: pos.focus, ...(t.op === undefined ? {} : { op: t.op }), ...extra });
}
