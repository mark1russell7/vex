import type { Addr, Axis, ErrorText, PrimitiveKind } from "@mark1russell7/vex";

/**
 * The loop IR (docs/COMPILER.md §3.3): a small language of statements between the Vex IR and the back ends. It has
 * locals, loops over arrays, checks and the functions of the runtime. A back end reads only this IR.
 *
 * A check that fails stops the program with a lazy error, and a materialize step gives the error of the interpreter
 * (§4.1). Where the error has a use, a check that cannot name its error stops the program with the value `FALLBACK`, and
 * tier 1 evaluates it. A check with the failure `STOP` stops the program in each context, because its failure is no error.
 */

/** The fixed locals of each program: the space, the origin, the variables and the tables of the run. */
export const SPACE = 0;
export const ORIGIN = 1;
export const VARS = 2;
export const TABLES = 3;
/** The number of fixed locals. */
export const FIXED_LOCALS = 4;

/** The functions of the runtime that generated code calls. Each one gives `FALLBACK` for a value it cannot give. */
export type RuntimeFn =
  | "has" // has(space, key): boolean
  | "addr" // addr(space, origin, focus, address, values?): the key of an address, with the values of its computed moves
  | "table" // table(tables, name): the space of a table
  | "keys" // keys(space): the keys of a space
  | "step" // step(name, acc, value): one step of reduce
  | "result" // result(value): the checks of the value of an op
  | "opts" // opts(value): the read of the option strict of a list op
  | "rec" // rec(names, values): a frozen record
  | "list" // list(keys, values): a list of an axis
  | "frozen" // frozen(array): a frozen copy
  | "ext" // ext(kind, data, space, origin, focus, path): an extension
  | "var" // var(vars, name): a variable of the run
  | "err" // err(site, origin, focus, ...operands): the lazy error of a failed check
  | "raise" // raise(error): the end of the program with a lazy error
  | "args" // args(site, origin, focus, errors): the error of the arguments that failed, or undefined for no error
  | "bad" // bad(value): the record of a result of an op that failed its checks
  | "invalid"; // invalid(thrown, domain): the record of an exception of a check `valid`

/** The primitive operations of the loop IR. They copy no arithmetic of a domain (§4.2). */
export type PrimOp =
  | "+" // the sum of a reduction, in the order of the interpreter
  | "/" // the mean of a reduction
  | "==="
  | "!=="
  | "!"
  | "||"
  | "&&"
  | "min" // Math.min, the minimum of a reduction
  | "max" // Math.max, the maximum of a reduction
  | "isNumber"
  | "isBoolean"
  | "isString"
  | "isValue" // not undefined and not null
  | "isObject" // an object or a function
  | "unless" // unless(ok, error): the error, or undefined when ok is true
  | "get" // get(space, key): the record of a key
  | "member" // member(object, name): the property of an object
  | "records" // records(space): the records of the space by index, or undefined (SPACE.RECORDS)
  | "recordAt" // recordAt(records, index, space, key): the record at an index, or else the record of the key
  | "keysOf" // keysOf(targets): the keys of the targets of an axis
  | "idxOf" // idxOf(targets): the index of each target in the keys of the space
  | "memoGet" // memoGet(memo, space, keys): the entry of a space and the values of its keys, or undefined
  | "memoPut" // memoPut(memo, space, keys, value, ok): the new entry of a space and the values of its keys
  | "entryValue" // entryValue(entry): the value of an entry of a memo
  | "entryOk"; // entryOk(entry): true if the entry has a value

/** A value of the loop IR. */
export type LExpr =
  | { readonly t: "const"; readonly i: number }
  | { readonly t: "local"; readonly n: number }
  | { readonly t: "num"; readonly v: number }
  | { readonly t: "bool"; readonly v: boolean }
  | { readonly t: "fallback" }
  /** The value `undefined`: no error. */
  | { readonly t: "none" }
  /** The `ErrorSite` at the index `i` of the constants. Only a failure reads it. */
  | { readonly t: "site"; readonly i: number }
  | { readonly t: "array"; readonly items: readonly LExpr[] }
  | { readonly t: "prim"; readonly op: PrimOp; readonly args: readonly LExpr[] }
  | { readonly t: "call"; readonly fn: RuntimeFn; readonly args: readonly LExpr[] }
  /**
   * The dispatch of the op whose name is the constant `name`, with the values of its arguments, the receiver first.
   * `kinds` are the kinds of the values that the lowering knows (KIND.STATIC).
   */
  | { readonly t: "op"; readonly name: number; readonly args: readonly LExpr[]; readonly kinds: readonly (PrimitiveKind | undefined)[] }
  /** The memo `id` of the program: the value of one node for each space (§7.2). */
  | { readonly t: "memo"; readonly id: number }
  /** The targets of the base axis that is the constant `axis`, at the space, the origin and the focus of `args`. */
  | { readonly t: "targets"; readonly axis: number; readonly args: readonly [LExpr, LExpr, LExpr] };

/**
 * The site of an error: the facts of the error that the lowering knows (docs/COMPILER.md §4.1). The operands of a
 * failure give the other facts. Each site has the path of its node, and `materialize` of the runtime reads it.
 */
export type ErrorSite =
  /** The origin is not a key of the space. */
  | { readonly t: "key" }
  /** The text does not depend on a value of the run. */
  | { readonly t: "text"; readonly text: ErrorText; readonly path: readonly number[] }
  /** A call of a name that is not a function here. Its operand is the variables of the run. */
  | { readonly t: "call"; readonly name: string; readonly path: readonly number[] }
  /** A reference that reads no value. Its operand is the key. */
  | { readonly t: "missing"; readonly where: string; readonly path: readonly number[] }
  /** An argument of a special form that is not a boolean. Its operand is the value. */
  | { readonly t: "boolean"; readonly op: string; readonly i: number; readonly path: readonly number[] }
  /** An item of a list op of the wrong kind. Its operand is the item. */
  | { readonly t: "items"; readonly op: string; readonly what: "numbers" | "booleans"; readonly path: readonly number[] }
  /** The test `until` of `iterate`, without a boolean. Its operand is the value. */
  | { readonly t: "until"; readonly path: readonly number[] }
  /** The limit of `iterate`, with no true value of the test. Its operand is the number of steps. */
  | { readonly t: "limit"; readonly path: readonly number[] }
  /** The test of `where`, without a boolean. Its operand is the value. */
  | { readonly t: "test"; readonly path: readonly number[] }
  /** A failure of an op. The runtime recorded the detail of the failure. */
  | { readonly t: "op"; readonly op: string; readonly path: readonly number[] }
  /** A failure of a step of `reduce`. Its operand is the name of the op. */
  | { readonly t: "step"; readonly path: readonly number[] }
  /** A failure of an extension. The runtime recorded the detail of the failure. */
  | { readonly t: "ext"; readonly kind: string; readonly path: readonly number[] }
  /** An address that gives no key. Its operands are the space and the values of its computed moves. */
  | { readonly t: "addr"; readonly at: Addr; readonly path: readonly number[] }
  /** An axis that gives no targets. Its operands are the space and the focus. */
  | { readonly t: "axis"; readonly axis: Exclude<Axis, { readonly t: "where" }>; readonly path: readonly number[] }
  /** Two or more arguments or fields that failed. Its operands are their errors. */
  | { readonly t: "args"; readonly what: string; readonly path: readonly number[] };

/**
 * What a failed check does. The interpreter gives an error value at the node of the check, and the context of the node
 * decides what happens to that error:
 *
 * - `return`: the program stops with the lazy error of the check.
 * - `stop`: the program stops with `FALLBACK`, and tier 1 evaluates it again. The check has no lazy error.
 * - `continue`: the item of a list op is an error item. The list op skips it, as the interpreter does. With the option
 *   `strict`, the list op fails instead, and `strict.else` tells what that failure does.
 * - `break`: the block ends. For the first argument of `ifError`, the second argument then gives the value. With `keep`,
 *   the local `keep` gets the lazy error, so a later read of it can stop the program.
 */
export type Fail =
  | { readonly t: "return" }
  | { readonly t: "stop" }
  | { readonly t: "continue"; readonly label: number; readonly strict?: { readonly cond: LExpr; readonly else: Fail } }
  | { readonly t: "break"; readonly label: number; readonly keep?: number };

/** A statement of the loop IR. */
export type LStmt =
  /** A new local with a value. */
  | { readonly t: "let"; readonly n: number; readonly value: LExpr }
  /** A new value of a local. */
  | { readonly t: "set"; readonly n: number; readonly value: LExpr }
  /** When `ok` is false, the statement does `fail`. The reason names the check, and `error` is its lazy error. */
  | { readonly t: "check"; readonly ok: LExpr; readonly reason: string; readonly fail: Fail; readonly error?: LExpr }
  /** A check that fails always: the interpreter always gives an error here. */
  | { readonly t: "fail"; readonly fail: Fail; readonly error?: LExpr }
  | { readonly t: "if"; readonly cond: LExpr; readonly yes: readonly LStmt[]; readonly no: readonly LStmt[] }
  /**
   * A loop over the items of an array, in order. The local `array` holds the array, `index` the index, and `item` each
   * item. A `continue` with the label goes to the next item.
   */
  | { readonly t: "loop"; readonly label: number; readonly item: number; readonly index: number; readonly array: number; readonly over: LExpr; readonly body: readonly LStmt[] }
  /** A block with a label. A `break` with the label ends it. */
  | { readonly t: "block"; readonly label: number; readonly body: readonly LStmt[] }
  /** The end of the block with the label. */
  | { readonly t: "break"; readonly label: number }
  /** A loop with a label that repeats its body until a `break` with the label ends it. */
  | { readonly t: "repeat"; readonly label: number; readonly body: readonly LStmt[] }
  /** The next item of the innermost loop. */
  | { readonly t: "next" }
  /** A value at the end of an array. */
  | { readonly t: "push"; readonly n: number; readonly value: LExpr }
  | { readonly t: "return"; readonly value: LExpr };

/** A program of the loop IR: its statements, the number of its locals and its constants. Each local is a name in the function. */
export interface LoopProgram {
  readonly body: readonly LStmt[];
  readonly locals: number;
  /** The constants, by index: literals, paths, addresses, axes and names. Generated code reads them by index (§5). */
  readonly constants: readonly unknown[];
}

// The constructors of the values of the loop IR.
export const local = (n: number): LExpr => ({ t: "local", n });
export const constant = (i: number): LExpr => ({ t: "const", i });
export const num = (v: number): LExpr => ({ t: "num", v });
export const bool = (v: boolean): LExpr => ({ t: "bool", v });
export const FALLBACK_EXPR: LExpr = { t: "fallback" };
export const RETURN: Fail = Object.freeze({ t: "return" });
export const STOP: Fail = Object.freeze({ t: "stop" });
export const array = (...items: LExpr[]): LExpr => ({ t: "array", items });
export const prim = (op: PrimOp, ...args: LExpr[]): LExpr => ({ t: "prim", op, args });
export const call = (fn: RuntimeFn, ...args: LExpr[]): LExpr => ({ t: "call", fn, args });

/** This function tells if a failure uses the lazy error of its check. */
export function keeps(f: Fail): boolean {
  switch (f.t) {
    case "return":
      return true;
    case "stop":
      return false;
    case "break":
      return f.keep !== undefined;
    case "continue":
      return f.strict !== undefined && keeps(f.strict.else);
  }
}

/** This function gives the failure of a check without a lazy error. Where the error has a use, the program stops. */
export function plainOf(f: Fail): Fail {
  if (f.t === "continue") return f.strict === undefined ? f : { ...f, strict: { cond: f.strict.cond, else: plainOf(f.strict.else) } };
  return f.t === "break" && f.keep === undefined ? f : STOP;
}
