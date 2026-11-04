import type { ExprTag } from "./ir.ts";
import type { Result } from "./result.ts";

/** One field read of a reference: the key and the path that it read, and if the read found a value. */
export interface Read {
  readonly key: string;
  readonly path: readonly string[];
  readonly ok: boolean;
}

/** The record of one node evaluation. The interpreter makes one event each time it evaluates a node. */
export interface TraceEvent {
  /** The position of the node in the expression tree. */
  readonly path: readonly number[];
  readonly tag: ExprTag;
  /** A short text for the node: the op name, the variable name or the field path. */
  readonly label: string;
  /** The key where the evaluation started. */
  readonly origin: string;
  /** The key where relative references read. Inside an axis, this is the target. */
  readonly focus: string;
  /** The field reads of a reference node. */
  readonly reads?: readonly Read[];
  /** The round of a `fix`: its count from 0, and the keys of the rows that it changed (FIX.TRACE). The result is the column. */
  readonly round?: { readonly index: number; readonly changed: readonly string[] };
  /** The result of the node. */
  readonly result: Result<unknown>;
}

/** A trace: the events of one evaluation, in the order that the nodes finished. */
export interface Trace {
  readonly events: readonly TraceEvent[];
  readonly result: Result<unknown>;
}

/** A receiver of trace events. */
export interface TraceSink {
  readonly events: TraceEvent[];
}
