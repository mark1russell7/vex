/**
 * The static reads of a program (DEPS.READS). The static kit of coeval finds the references of the document of the
 * program, by the contracts of Vex (`refsOf`). Vex adds only what is its own: the axes around a read, and the reads of
 * a function at each of its calls (FN.CALL).
 */
import { pathMatches, refsOf, type DocVisit, type Key, type RefUse } from "@mark1russell7/coeval";
import type { Addr, Axis, Expr, ExprOf } from "./ir.ts";
import { VEX_WORLD } from "./kernel.ts";
import { writeDocument } from "./write.ts";

/** One static read of a program: a field path at an address, inside zero or more axes. */
export interface Dependency {
  /** The address of the read. The empty address is the focus. */
  readonly at: Addr;
  /** The field path of the read. */
  readonly path: readonly string[];
  /** The axes around the read, from the outside to the inside. Inside an axis, the focus is the target. */
  readonly axes: readonly Axis["t"][];
  /** The address of each axis in `axes`, in the same order. The empty address is the focus. */
  readonly axisAt: readonly Addr[];
}

/** An axis around a read: the kind of the axis of a loop, and the address of the loop. */
interface Around {
  readonly t: Axis["t"];
  readonly at: Addr;
}

/** A chain of items, the innermost first. The chains of two documents share the items of the documents around both. */
interface Chain<T> {
  readonly item: T;
  readonly up: Chain<T> | undefined;
}

/** The context of a document for its reads. */
interface Context {
  /** The axes around the document, the innermost first. */
  readonly axes: Chain<Around> | undefined;
  /** Inside the axis document of a loop: the axis of that loop. A test of `where` there is inside the axis. */
  readonly axis: Around | undefined;
  /** The nearest function around the document: a binding of a let. Its reads happen at its calls, not here. */
  readonly fn: DocVisit | undefined;
  /** The calls around the document whose function is a binding of a let, the innermost first. */
  readonly calls: Chain<DocVisit> | undefined;
}

const ROOT: Context = { axes: undefined, axis: undefined, fn: undefined, calls: undefined };

/** This function gives the items of a chain until the chain `end`, from the outside to the inside. */
function itemsUntil<T>(chain: Chain<T> | undefined, end: Chain<T> | undefined): T[] {
  const out: T[] = [];
  for (let c = chain; c !== undefined && c !== end; c = c.up) out.push(c.item);
  return out.toReversed();
}

/** This function gives the kind of a visit, as its keys joined with dots, for example `each` or `axes.where`. */
// Stryker disable next-line ArrayDeclaration: each document of the writer has a type of the world, so each visit has a type path
const kindOf = (v: DocVisit): string => (v.typePath ?? []).join(".");

/**
 * This function gives the static reads of an expression. A host can use them to recompute a program only when a field
 * that it reads changes. A computed move reads a key that only a run knows. Its address keeps the expression, and the
 * reads of that expression are in the list too (DEPS.COMPUTED). The kernel walks the document with a stack, so an
 * expression of any depth works (EVAL.NESTING).
 */
export function deps(e: Expr): readonly Dependency[] {
  const nodes = new Map<object, Expr>();
  // The order "reads" puts the body or the steps of a loop before its axis, as the reads of an evaluation come.
  const doc = writeDocument(e, {
    // Stryker disable next-line ArrayDeclaration: the reads come from the references, not from the form of a literal
    domains: [],
    // Stryker disable next-line StringLiteral: the writer tests only the mode "json", and each other mode keeps the value
    literals: "host",
    order: "reads",
    nodes,
  });
  const uses = refsOf(VEX_WORLD, doc);
  const memo = new WeakMap<DocVisit, Context>();
  const functions = new WeakMap<DocVisit, DocVisit | null>();
  const fnVisits = new Map<unknown, DocVisit>();

  /** This function gives the function of a call: the visit of the binding of a let, or `undefined` (FN.CALL). */
  const functionOf = (call: DocVisit): DocVisit | undefined => {
    const known = functions.get(call);
    if (known !== undefined) return known ?? undefined;
    const name = (call.doc.value as { readonly fn: { readonly value: readonly [string, string] } }).fn.value[1];
    let found: DocVisit | undefined;
    // The innermost kind that binds the name decides. A parameter, a binding or a name of a loop hides a function.
    search: for (let child: DocVisit = call, around = call.parent; around !== undefined; child = around, around = around.parent) {
      // Stryker disable next-line OptionalChaining: each document around a call is a term or a function, so it has a kind
      for (const rule of around.kind?.scope ?? []) {
        if (!rule.in.some((pattern) => pathMatches(child.slot, pattern))) continue;
        const source = rule.names as { readonly keysAt?: readonly Key[]; readonly listAt?: readonly Key[] };
        // Stryker disable next-line ArrayDeclaration: each rule of the scopes of Vex gives its names with keysAt or listAt
        const at = (source.keysAt ?? source.listAt ?? []).reduce<unknown>((x, k) => (x as Readonly<Record<string, unknown>>)[String(k)], around.doc.value);
        const names = source.keysAt !== undefined ? Object.keys(at as object) : (at as readonly string[]);
        if (!names.includes(name)) continue;
        // Only a binding of a let is a function (FN.BIND), and the map has only the documents of the functions.
        found = fnVisits.get((at as Readonly<Record<string, unknown>>)[name]);
        break search;
      }
    }
    functions.set(call, found ?? null);
    return found;
  };

  /** This function gives the context of a child from the context of its parent. */
  const step = (outer: Context, parent: DocVisit, child: DocVisit): Context => {
    const kind = kindOf(parent);
    const head = child.slot[0];
    let { axes, fn, calls } = outer;
    let axis: Around | undefined;
    if (outer.axis !== undefined) {
      // In the axis document of a loop: a test of where is inside the axis, and the list of the axis list is outside.
      // Only the axis where has a test.
      if (head === "test") axes = { item: outer.axis, up: axes };
      else if (head === "axis") axis = outer.axis;
    } else if (kind === "each" || kind === "fold") {
      const node = nodes.get(parent.doc) as ExprOf<"each" | "fold">;
      const around: Around = { t: node.axis.t, at: node.at ?? [] };
      if (head === "body" || head === "step") axes = { item: around, up: axes };
      else if (head === "axis") axis = around;
    }
    if (kind === "fn") {
      fn = parent;
      fnVisits.set(parent.doc, parent);
    }
    // Each call goes in the chain, also a call of a name that is not a function: inCall looks for one call of a function.
    if (kind === "call") calls = { item: parent, up: calls };
    return { axes, axis, fn, calls };
  };

  /**
   * This function gives the context of a visit. It walks up to a known context with a loop, not with recursion. The
   * context of no visit is the context of the root.
   */
  const contextOf = (v: DocVisit | undefined): Context => {
    const todo: DocVisit[] = [];
    let x: DocVisit | undefined = v;
    while (x !== undefined && !memo.has(x)) {
      todo.push(x);
      x = x.parent;
    }
    let ctx = x === undefined ? ROOT : (memo.get(x) as Context);
    for (let i = todo.length - 1; i >= 0; i--) {
      const child = todo[i] as DocVisit;
      ctx = child.parent === undefined ? ROOT : step(ctx, child.parent, child);
      memo.set(child, ctx);
    }
    return ctx;
  };

  // The references of each function, apart from the others: they read at each call of the function.
  const groups = new Map<DocVisit | undefined, RefUse[]>();
  for (const use of uses) {
    const fn = contextOf(use.visit).fn;
    const group = groups.get(fn) ?? [];
    group.push(use);
    groups.set(fn, group);
  }

  const out: Dependency[] = [];
  /** This function gives the reads of the references of a function at a call, inside the axes of the call. */
  const emit = (group: readonly RefUse[], base: DocVisit | undefined, outside: readonly Around[]): void => {
    const baseAxes = contextOf(base).axes;
    const inside = (v: DocVisit): readonly Around[] => [...outside, ...itemsUntil(contextOf(v).axes, baseAxes)];
    // The reads of a call come after the reads of its arguments, so a call waits until the walk leaves it.
    const pending: { readonly call: DocVisit; readonly fn: DocVisit; readonly axes: readonly Around[] }[] = [];
    const inCall = (v: DocVisit | undefined, call: DocVisit): boolean => {
      for (let c = contextOf(v).calls; c !== undefined && c.item.depth >= call.depth; c = c.up) if (c.item === call) return true;
      return false;
    };
    const flush = (until?: DocVisit): void => {
      for (;;) {
        const top = pending.at(-1);
        if (top === undefined || inCall(until, top.call)) return;
        pending.pop();
        emit(groups.get(top.fn) ?? [], top.fn, top.axes);
      }
    };
    for (const use of group) {
      flush(use.visit);
      if (use.root === "self" && !use.address) {
        const node = nodes.get(use.visit.doc) as ExprOf<"ref">;
        const axes = inside(use.visit);
        out.push({ at: node.at ?? [], path: node.path, axes: axes.map((a) => a.t), axisAt: axes.map((a) => a.at) });
      }
      const call = use.visit.parent;
      if (call !== undefined && kindOf(call) === "call" && use.visit.slot[0] === "fn") {
        const fn = functionOf(call);
        if (fn !== undefined) pending.push({ call, fn, axes: inside(call) });
      }
    }
    flush();
  };
  emit(groups.get(undefined) ?? [], undefined, []);
  return out;
}
