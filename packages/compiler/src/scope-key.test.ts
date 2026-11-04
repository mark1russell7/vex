/**
 * The rule of the key of a constant and of a column: two expressions with one key at their places have one value under
 * the interpreter. The names of the programs collide on purpose with the codes of the variables.
 */
import { app, axes, call, each, evaluate, fix, fn, fold, iterate, last, let_, lit, rec, ref, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keyText, type KeyScope } from "./scope-key.ts";

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
/** The names of the programs. Two of them are also codes, so a name of the run can have the text of a variable. */
const NAMES = ["x", "y", "c0", "v0"] as const;
const CODES = ["c0", "v0", "q0"] as const;
/** The value of each variable of the code. One variable has one value at each place. */
const VALUES: Readonly<Record<string, number>> = { c0: 5, v0: 7, q0: 11 };
/** The values of the names of the run. A name of the run with the text of a code has another value than that code. */
const RUN: Readonly<Record<string, number>> = { x: 13, y: 17, c0: 19, v0: 23 };
/** The object of a node of the memo, and the name that reads it. */
const NODE = v("k");
const NOTHING: KeyScope = { keys: new Map(), env: new Map(), fns: new Map(), columns: new Map() };
const ITEMS = lit(vexList([{ key: "0", result: { ok: true, value: 1 } }]));

const add = (a: Expr, b: Expr): Expr => app("add", a, b);
const eachOver = (list: Expr, body: Expr): Expr => each(axes.list(list), body, undefined, ["x"]);
const foldOf = (init: Expr, step: Expr, result: Expr): Expr => fold(axes.all, { x: init }, { x: step }, result);
const foldItems = (step: Expr, result: Expr): Expr => fold(axes.list(ITEMS), { s: lit(0) }, { s: step }, result, undefined, ["x"]);
const foldAt = (list: Expr, place: Expr): Expr => fold(axes.list(list), { x: lit(0) }, { x: lit(0) }, lit(0), [{ t: "key", key: place }]);
const iterateOf = (init: Expr, step: Expr, result: Expr, until?: Expr): Expr => iterate(1, { x: init }, { x: step }, result, until);
const limited = (list: Expr): Expr => iterate({ axis: axes.list(list) }, { x: lit(0) }, { x: lit(0) }, lit(0));
const first = (name: string, body: Expr): Expr => fix(name, "max", body, lit(0));

/** A program with holes: each hole takes the next name of a list, so two programs of one shape differ only in their reads. */
type Shape = (next: () => string) => Expr;

/** The place of a program: the variable of each name, the variable of the node of the memo, and the number of the function `h`. */
interface Site {
  readonly env: readonly (readonly [string, string])[];
  readonly node: string;
  readonly h: number;
}

const someName = fc.constantFrom(...NAMES);
const someCode = fc.constantFrom(...CODES);
const site: fc.Arbitrary<Site> = fc.record({ env: fc.uniqueArray(fc.tuple(someName, someCode), { maxLength: 4, selector: ([name]) => name }), node: someCode, h: fc.constantFrom(1, 2) });

/** The shapes: a read, a sum, each form that binds a name, a call, and one object at two places. */
const { shape } = fc.letrec<{ shape: Shape }>((tie) => {
  const sub = tie("shape");
  return {
    shape: fc.oneof(
      { maxDepth: 4, depthIdentifier: "shape", withCrossShrink: true },
      fc.constant<Shape>((next) => v(next())),
      fc.constant<Shape>((next) => v(next())),
      fc.constant<Shape>(() => NODE),
      fc.constant<Shape>((next) => call("h", v(next()))),
      fc.tuple(sub, sub).map(([a, b]): Shape => (next) => add(a(next), b(next))),
      fc.tuple(someName, sub, sub).map(([name, a, b]): Shape => (next) => let_({ [name]: a(next) }, b(next))),
      fc.tuple(someName, sub, sub).map(([name, a, b]): Shape => (next) => let_({ h: fn([name], a(next)) }, call("h", b(next)))),
      fc.tuple(someName, sub).map(([name, a]): Shape => (next) => app("sum", each(axes.list(ITEMS), a(next), undefined, [name]))),
      fc.tuple(someName, sub, sub, sub).map(([name, a, b, c]): Shape => (next) => fold(axes.all, { [name]: a(next) }, { [name]: add(v(name), b(next)) }, c(next))),
      fc.tuple(someName, someName, sub, sub).map(([name, item, a, b]): Shape => (next) => fold(axes.list(ITEMS), { [name]: lit(0) }, { [name]: a(next) }, b(next), undefined, [item])),
      fc.tuple(someName, sub, sub, sub).map(([name, a, b, c]): Shape => (next) => iterate(1, { [name]: a(next) }, { [name]: b(next) }, c(next))),
      sub.map((a): Shape => (next) => fix("r", "max", a(next), last("r"))),
      fc.tuple(someName, sub).map(([name, a]): Shape => (next) => {
        const once = a(next);
        return add(once, let_({ [name]: lit(29) }, once));
      }),
    ),
  };
});

/** This function fills a shape with names. */
function filled(s: Shape, names: readonly string[]): Expr {
  let i = 0;
  return s(() => names[i++ % names.length] as string);
}

/** This function gives the scope of a site. */
const scopeOf = (at: Site): KeyScope => ({ ...NOTHING, keys: new Map([[NODE, { code: at.node }]]), env: new Map(at.env.map(([name, code]) => [name, { code }])), fns: new Map([["h", { id: at.h }]]) });

/** This function gives the value of an expression at its site under the interpreter. */
function value(e: Expr, at: Site): unknown {
  const binds = Object.fromEntries(at.env.map(([name, code]) => [name, lit(VALUES[code])]));
  const whole = let_({ ...binds, k: lit(VALUES[at.node]), h: fn(["p"], add(v("p"), lit(at.h))) }, e);
  const s = space.array([{ n: 1 }]);
  return fromCore(evaluate(whole, { space: s, origin: "0", vars: RUN, domains: DOMAINS }));
}

const SCOPE: KeyScope = {
  keys: new Map(),
  env: new Map([
    ["x", { code: "c0" }],
    ["y", { code: "c0" }],
  ]),
  fns: new Map([["h", { id: 1 }]]),
  columns: new Map([["r", { code: "col0" }]]),
};
const key = (e: Expr, scope: KeyScope = SCOPE): string => keyText(e, scope);
const X = v("x");
const Y = v("y");
const atOne = (body: Expr): Expr => let_({ x: lit(1) }, body);

describe("V-078 KEY: a key holds the meaning of each read", () => {
  it("V-078 P17 KEY: two expressions with one key at their places have one value", () => {
    fc.assert(
      fc.property(shape, fc.array(someName, { minLength: 1, maxLength: 6 }), fc.array(someName, { minLength: 1, maxLength: 6 }), site, site, (s, reads, others, here, there) => {
        const a = filled(s, reads);
        const b = filled(s, others);
        fc.pre(keyText(a, scopeOf(here)) === keyText(b, scopeOf(there)));
        expect(value(a, here)).toStrictEqual(value(b, there));
      }),
    );
  });

  it("V-078: two reads of one variable have one key", () => {
    expect(key(add(X, lit(1)))).toBe(key(add(Y, lit(1))));
  });

  it("V-078: a read of a name that a let binds is not the read of the outer name", () => {
    expect(key(atOne(X))).not.toBe(key(atOne(Y)));
  });

  it("V-078: a read in the value of a let is a read of the outer name", () => {
    expect(key(let_({ x: X }, lit(1)))).toBe(key(let_({ x: Y }, lit(1))));
  });

  it("V-078: a binding does not see the other bindings", () => {
    expect(key(let_({ x: lit(1), z: X }, lit(0)))).toBe(key(let_({ x: lit(1), z: Y }, lit(0))));
  });

  it("V-078: a parameter hides a name in the body of a function, and the function does not see its own let", () => {
    expect(key(fn(["x"], X))).not.toBe(key(fn(["x"], Y)));
    expect(key(let_({ x: fn(["z"], X) }, lit(0)))).toBe(key(let_({ x: fn(["z"], Y) }, lit(0))));
  });

  it("V-078: the name of an item is only in the body of an each", () => {
    expect(key(eachOver(ITEMS, X))).not.toBe(key(eachOver(ITEMS, Y)));
    expect(key(eachOver(X, lit(1)))).toBe(key(eachOver(Y, lit(1))));
    expect(key(each(axes.where(axes.all, X), lit(1), undefined, ["x"]))).toBe(key(each(axes.where(axes.all, Y), lit(1), undefined, ["x"])));
    expect(key(each(axes.all, lit(1), [{ t: "key", key: X }], ["x"]))).toBe(key(each(axes.all, lit(1), [{ t: "key", key: Y }], ["x"])));
    expect(key(each(axes.all, X))).toBe(key(each(axes.all, Y)));
  });

  it("V-078: a fold gives its names to its steps and to its result, and its items only to its steps", () => {
    expect(key(foldOf(X, lit(0), lit(0)))).toBe(key(foldOf(Y, lit(0), lit(0))));
    expect(key(foldOf(lit(0), X, lit(0)))).not.toBe(key(foldOf(lit(0), Y, lit(0))));
    expect(key(foldOf(lit(0), lit(0), X))).not.toBe(key(foldOf(lit(0), lit(0), Y)));
    expect(key(foldItems(X, lit(0)))).not.toBe(key(foldItems(Y, lit(0))));
    expect(key(foldItems(lit(0), X))).toBe(key(foldItems(lit(0), Y)));
    expect(key(foldAt(X, lit(0)))).toBe(key(foldAt(Y, lit(0))));
    expect(key(foldAt(ITEMS, X))).toBe(key(foldAt(ITEMS, Y)));
  });

  it("V-078: an iterate gives its names to its steps, to its test and to its result", () => {
    expect(key(iterateOf(X, lit(0), lit(0)))).toBe(key(iterateOf(Y, lit(0), lit(0))));
    expect(key(iterateOf(lit(0), X, lit(0)))).not.toBe(key(iterateOf(lit(0), Y, lit(0))));
    expect(key(iterateOf(lit(0), lit(0), X))).not.toBe(key(iterateOf(lit(0), lit(0), Y)));
    expect(key(iterateOf(lit(0), lit(0), lit(0), X))).not.toBe(key(iterateOf(lit(0), lit(0), lit(0), Y)));
    expect(key(limited(X))).toBe(key(limited(Y)));
  });

  it("V-078: a fix gives its name only to its step", () => {
    expect(key(fix("r", "max", lit(0), last("s")))).toBe(key(fix("r", "max", lit(0), last("s"))));
    expect(key(fix("r", "max", lit(0), last("r")))).not.toBe(key(fix("r", "max", lit(0), last("s"))));
    expect(key(first("r", X))).toBe(key(first("r", Y)));
    expect(key(first("r", last("r")))).not.toBe(key(first("r", lit(0))));
  });

  it("V-078: a read of a column gives the code of the column", () => {
    const other: KeyScope = { ...SCOPE, columns: new Map([["s", { code: "col0" }]]) };
    expect(key(last("r"))).toBe(key(last("s"), other));
    expect(key(last("r"))).not.toBe(key(last("r"), { ...SCOPE, columns: new Map([["r", { code: "col1" }]]) }));
    expect(key(last("r"), NOTHING)).toBe(key(last("s"), NOTHING));
  });

  it("V-078: a call gives the number of its binding, and a call of a bound function keeps its spelling", () => {
    const again: KeyScope = { ...SCOPE, fns: new Map([["h", { id: 2 }]]) };
    expect(key(call("h", X))).toBe(key(call("h", Y)));
    expect(key(call("h", X))).not.toBe(key(call("h", X), again));
    expect(key(let_({ h: fn([], lit(0)) }, call("h")))).toBe(key(let_({ h: fn([], lit(0)) }, call("h")), again));
    expect(key(let_({ h: fn(["z"], lit(0)) }, call("h", X)))).toBe(key(let_({ h: fn(["z"], lit(0)) }, call("h", Y))));
    expect(key(call("none"))).toBe(key(call("none"), NOTHING));
  });

  it("V-078: a name of the run with the text of a code is not the variable of that code", () => {
    expect(key(v("c0"))).not.toBe(key(X));
    expect(key(v("c0"))).toBe(key(v("c0"), NOTHING));
  });

  it("V-078: a node of the memo gives its variable, and its parts are not a part of the key", () => {
    const node = add(X, lit(1));
    const other = add(Y, lit(2));
    const held = key(app("abs", node), { ...SCOPE, keys: new Map([[node, { code: "q0" }]]) });
    expect(held).toBe(key(app("abs", other), { ...SCOPE, keys: new Map([[other, { code: "q0" }]]) }));
    expect(held).not.toBe(key(app("abs", node)));
  });

  it("V-078: a literal keeps its value, -0 is not 0, and the parts of a record, a read and an extension keep their form", () => {
    expect(key(lit(-0))).not.toBe(key(lit(0)));
    expect(key(lit("x"))).not.toBe(key(X));
    expect(key(lit(vexList([])))).toBe(key(lit(vexList([]))));
    expect(key(rec({ p: X }))).toBe(key(rec({ p: Y })));
    expect(key(rec({ p: X }))).not.toBe(key(rec({ q: X })));
    expect(key(ref("n", [{ t: "key", key: X }]))).toBe(key(ref("n", [{ t: "key", key: Y }])));
    expect(key({ tag: "ext", kind: "k", data: { tag: "var", name: "x" } })).not.toBe(key({ tag: "ext", kind: "k", data: { tag: "var", name: "y" } }));
  });
});
