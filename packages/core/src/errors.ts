import type { KernelCode } from "@mark1russell7/coeval";

/**
 * The error codes of Vex. The names come from the spreadsheet error values, because a Vex program is a spreadsheet
 * formula over records. Each code is a code of the kernel of coeval with the same meaning: for example `#N/A` is a step
 * that reaches nothing, and `#DEPTH!` is a full call stack. The type checks it: a code that the kernel does not have is
 * not a member.
 */
export type ErrorCode = Extract<KernelCode, "#REF!" | "#N/A" | "#VALUE!" | "#NAME?" | "#NUM!" | "#CALC!" | "#ARGS" | "#CYCLE!" | "#DEPTH!">;

/** The cause of an error, in more detail than the code. */
export type ErrorKind =
  | "unknown-key"
  | "not-a-pair"
  | "out-of-bounds"
  | "no-offset"
  | "no-grid"
  | "no-tree"
  | "no-table"
  | "no-graph"
  | "missing-field"
  | "empty"
  | "not-instance"
  | "kind-mismatch"
  | "unknown-op"
  | "unbound"
  | "not-finite"
  | "invalid-value"
  | "threw"
  | "undefined-result"
  | "args"
  | "cycle"
  | "depth"
  | "bad-expression"
  | "limit";

const CODE_OF: Readonly<Record<ErrorKind, ErrorCode>> = {
  "unknown-key": "#REF!",
  "not-a-pair": "#REF!",
  "out-of-bounds": "#REF!",
  "no-offset": "#REF!",
  "no-grid": "#REF!",
  "no-tree": "#REF!",
  "no-table": "#REF!",
  "no-graph": "#REF!",
  "missing-field": "#N/A",
  empty: "#N/A",
  "not-instance": "#VALUE!",
  "kind-mismatch": "#VALUE!",
  "bad-expression": "#VALUE!",
  "unknown-op": "#NAME?",
  unbound: "#NAME?",
  "not-finite": "#NUM!",
  "invalid-value": "#NUM!",
  limit: "#NUM!",
  threw: "#CALC!",
  "undefined-result": "#CALC!",
  args: "#ARGS",
  cycle: "#CYCLE!",
  depth: "#DEPTH!",
};

/**
 * This function tells if an exception is the report of the engine that the call stack is full. V8 and JavaScriptCore
 * throw a `RangeError`. SpiderMonkey throws an `InternalError` ("too much recursion").
 */
export function isStackOverflow(thrown: unknown): boolean {
  if (!(thrown instanceof Error)) return false;
  return (thrown instanceof RangeError && /call stack/i.test(thrown.message)) || (thrown.name === "InternalError" && /recursion/i.test(thrown.message));
}

/** This function tells if an error is `#DEPTH!`. `ifError` and the reductions that skip errors do not hide it (EVAL.DEPTH). */
export const isDepthError = (e: VexError): boolean => e.kind === "depth";

/** A Vex error. It is a value: a program can catch it with `ifError`, except `#DEPTH!`. */
export interface VexError {
  /** The spreadsheet-style code, for example `#REF!`. */
  readonly code: ErrorCode;
  /** The cause in more detail. */
  readonly kind: ErrorKind;
  /** A sentence that tells what went wrong. */
  readonly message: string;
  /** The position of the failed node in the expression tree. The root is `[]`. */
  readonly path: readonly number[];
  /** The key where the evaluation started. */
  readonly origin?: string;
  /** The key where relative references read when the error occurred. */
  readonly focus?: string;
  /** The op name, for errors of an op. */
  readonly op?: string;
  /** The errors of the arguments, for the code `#ARGS`. */
  readonly causes?: readonly VexError[];
  /** The value that an op threw, for the kind `threw`. */
  readonly thrown?: unknown;
}

/** The details that a caller can give to `vexError`. */
export interface ErrorDetails {
  readonly path?: readonly number[];
  readonly origin?: string;
  readonly focus?: string;
  readonly op?: string;
  readonly causes?: readonly VexError[];
  readonly thrown?: unknown;
}

/** This function gives the code of an error kind. */
export const codeOf = (kind: ErrorKind): ErrorCode => CODE_OF[kind];

/** This function makes a `VexError`. */
export function vexError(kind: ErrorKind, message: string, details: ErrorDetails = {}): VexError {
  return {
    code: CODE_OF[kind],
    kind,
    message,
    path: details.path ?? [],
    ...(details.origin === undefined ? {} : { origin: details.origin }),
    ...(details.focus === undefined ? {} : { focus: details.focus }),
    ...(details.op === undefined ? {} : { op: details.op }),
    ...(details.causes === undefined ? {} : { causes: details.causes }),
    ...(details.thrown === undefined ? {} : { thrown: details.thrown }),
  };
}

/** This function gives a short text for an error, for example `#REF! unknown-key: there is no key "Z"`. */
export const formatError = (e: VexError): string => `${e.code} ${e.kind}: ${e.message}`;
