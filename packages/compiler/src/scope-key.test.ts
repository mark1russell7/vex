/**
 * This file tests the rule of the key of a constant and of a column. Two expressions with one key at their places have
 * one value under the interpreter. The names of the programs collide on purpose with the codes of the variables.
 */
import { app, axes, call, each, evaluate, fix, fn, fold, iterate, last, let_, lit, rec, ref, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keyWatch } from "../test/key-gate.ts";
import { plainKey } from "../test/plain-key.ts";
import { emitModule, withKeyProbe } from "./module.ts";
import { KeyTable, keyText, type KeyScope } from "./scope-key.ts";

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
  return s(() => names.at(i++ % names.length) ?? "");
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
const TABLE = new KeyTable();
const key = (e: Expr, scope: KeyScope = SCOPE): string => keyText(e, scope, TABLE);
/** This function gives the key of an expression with the table of the test. */
const key2 = (e: Expr, scope: KeyScope): string => keyText(e, scope, SECOND);
const SECOND = new KeyTable();
const X = v("x");
const Y = v("y");
const atOne = (body: Expr): Expr => let_({ x: lit(1) }, body);

/** This probe changes a map of the memo after a read of its keys. */
function changeKeys(_e: Expr, scope: KeyScope): void {
  (scope.keys as Map<Expr, { code: string }>).set(X, { code: "v0" });
}

/** This function gives the count of the reads of the nodes, for a key at each level of a chain. Each level has new maps. */
function walkOfChain(levels: number): number {
  let count = 0;
  const seen = (e: Expr): Expr =>
    new Proxy(e, {
      get(target, name, receiver): unknown {
        if (name === "tag") count++;
        return Reflect.get(target, name, receiver) as unknown;
      },
    });
  const table = new KeyTable();
  let e = seen(X);
  for (let i = 0; i < levels; i++) {
    e = seen(add(e, X));
    keyText(e, { keys: new Map(), env: new Map(SCOPE.env), fns: new Map(SCOPE.fns), columns: new Map(SCOPE.columns) }, table);
  }
  return count;
}

/** This function gives the count of the reads of the nodes, for a key at each level of a let chain. Each level has a new name. */
function walkOfLets(levels: number): number {
  let count = 0;
  const seen = (e: Expr): Expr =>
    new Proxy(e, {
      get(target, name, receiver): unknown {
        if (name === "tag") count++;
        return Reflect.get(target, name, receiver) as unknown;
      },
    });
  const table = new KeyTable();
  let e = seen(X);
  for (let i = 0; i < levels; i++) {
    e = seen(let_({ [`x${String(i)}`]: seen(lit(i)) }, seen(add(e, seen(v(`x${String(i)}`))))));
    keyText(e, { ...NOTHING, env: new Map([...SCOPE.env, [`x${String(i)}`, { code: `c${String(i)}` }]]) }, table);
  }
  return count;
}

describe("V-078 KEY: a key holds the meaning of each read", () => {
  it("V-078 P17 KEY: two expressions with one key at their places have one value", () => {
    fc.assert(
      fc.property(shape, fc.array(someName, { minLength: 1, maxLength: 6 }), fc.array(someName, { minLength: 1, maxLength: 6 }), site, site, (s, reads, others, here, there) => {
        const a = filled(s, reads);
        const b = filled(s, others);
        fc.pre(key(a, scopeOf(here)) === key(b, scopeOf(there)));
        expect(value(a, here)).toStrictEqual(value(b, there));
      }),
    );
  });

  it("V-078 KEY: two keys of one table are equal if and only if their plain keys are equal", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(shape, fc.array(someName, { minLength: 1, maxLength: 6 }), site), { minLength: 2, maxLength: 6 }), (cases) => {
        const table = new KeyTable();
        const sites = cases.map(([s, reads, at]) => ({ e: filled(s, reads), scope: scopeOf(at) }));
        const keys = sites.map(({ e, scope }) => keyText(e, scope, table));
        const plain = sites.map(({ e, scope }) => plainKey(e, scope));
        const pairs = keys.flatMap((a, i) => keys.map((b, j) => [a === b, plain[i] === plain[j]]));
        expect(pairs.filter(([sameKey, samePlain]) => sameKey !== samePlain)).toStrictEqual([]);
      }),
    );
  });

  it("KEY: a map of names that changes after a read gives the key of its new content", () => {
    const table = new KeyTable();
    const env = new Map([["x", { code: "c0" }]]);
    const scope: KeyScope = { ...NOTHING, env };
    const watch = keyWatch();
    const before = keyText(X, scope, table);
    watch.probe(X, scope, before, table);
    env.set("x", { code: "v0" });
    const after = keyText(X, scope, table);
    watch.probe(X, scope, after, table);
    expect(after).not.toBe(before);
    expect(watch.faults).toStrictEqual([]);
  });

  it("KEY: a change of a map of the memo after a read is a refusal, and the map and the key stay", () => {
    const table = new KeyTable();
    const keys = new Map([[NODE, { code: "c0" }]]);
    const scope: KeyScope = { ...NOTHING, keys };
    const before = keyText(add(NODE, lit(1)), scope, table);
    expect(() => keys.set(X, { code: "v0" })).toThrow("a map of the memo changed after a read of its keys");
    expect(() => keys.delete(NODE)).toThrow("a map of the memo changed after a read of its keys");
    expect(() => {
      keys.clear();
    }).toThrow("a map of the memo changed after a read of its keys");
    expect([...keys.keys()]).toStrictEqual([NODE]);
    expect(keyText(add(NODE, lit(1)), scope, table)).toBe(before);
  });

  it("KEY: a print gives a refusal with a reason for a change of a map of the memo after a read", () => {
    const options = { domains: DOMAINS, schema: { fields: { n: "number" } } } as const;
    expect(withKeyProbe(changeKeys, () => emitModule(app("sum", each(axes.all, ref("n"))), options))).toStrictEqual({ ok: false, reason: "a map of the memo changed after a read of its keys" });
  });

  it("KEY: a map of the memo with a read in two tables stays sealed", () => {
    const keys = new Map([[NODE, { code: "c0" }]]);
    const scope: KeyScope = { ...NOTHING, keys };
    keyText(NODE, scope, new KeyTable());
    keyText(NODE, scope, new KeyTable());
    expect(() => keys.set(X, { code: "v0" })).toThrow("a map of the memo changed after a read of its keys");
  });

  it("KEY: the gate finds two keys for one plain key", () => {
    const table = new KeyTable();
    const watch = keyWatch();
    watch.probe(X, SCOPE, "a", table);
    watch.probe(X, SCOPE, "b", table);
    expect(watch.faults).toStrictEqual(["one plain key has the keys a and b"]);
  });

  it("KEY: the gate reads each table apart", () => {
    const watch = keyWatch();
    watch.probe(X, SCOPE, "a", new KeyTable());
    watch.probe(Y, NOTHING, "a", new KeyTable());
    expect(watch.faults).toStrictEqual([]);
  });

  it("KEY: a key has a small text at each size of the program", () => {
    let e: Expr = add(X, Y);
    for (let i = 0; i < 16; i++) e = add(e, e);
    const copy = JSON.parse(JSON.stringify(e)) as Expr;
    const table = new KeyTable();
    expect(keyText(copy, SCOPE, table).length).toBeLessThan(32);
    expect(keyText(copy, SCOPE, table)).toBe(keyText(e, SCOPE, table));
  });

  it("KEY: the walk of the keys of a chain grows with the chain, also with new maps at each level", () => {
    expect(walkOfChain(800) / walkOfChain(400)).toBeLessThan(2.2);
  });

  it("KEY: a let chain walks each node once, also with a new key at each level", () => {
    expect(walkOfLets(800) / walkOfLets(400)).toBeLessThan(2.2);
  });

  it("KEY: two scopes with the same content give one key", () => {
    const table = new KeyTable();
    const twin: KeyScope = { ...SCOPE, env: new Map(SCOPE.env) };
    expect(keyText(add(X, lit(1)), SCOPE, table)).toBe(keyText(add(X, lit(1)), twin, table));
  });

  it("KEY: one expression has a key for each set of names around it", () => {
    const table = new KeyTable();
    const inner = add(X, lit(1));
    const bound = keyText(let_({ x: lit(1) }, inner), SCOPE, table);
    expect(keyText(inner, SCOPE, table)).not.toBe(bound);
    expect(keyText(let_({ x: lit(1) }, inner), SCOPE, table)).toBe(bound);
    expect(keyText(let_({ y: lit(1) }, inner), SCOPE, table)).not.toBe(bound);
  });

  it("KEY: one expression has a key for each set of rounds around it", () => {
    const table = new KeyTable();
    const scope: KeyScope = { ...SCOPE, columns: new Map([["r", { code: "col0" }]]) };
    const inner = add(last("r"), lit(1));
    expect(keyText(inner, scope, table)).not.toBe(keyText(first("r", inner), scope, table));
    expect(keyText(first("r", inner), scope, table)).toBe(keyText(first("r", inner), scope, table));
  });

  it("KEY: a name and a round of one spelling are two places", () => {
    const table = new KeyTable();
    const scope: KeyScope = { ...SCOPE, columns: new Map([["x", { code: "col0" }]]) };
    const reads = add(last("x"), X);
    const round = first("x", reads);
    const name = let_({ x: lit(1) }, reads);
    expect(keyText(round, scope, table)).toBe(key2(round, scope));
    expect(keyText(name, scope, table)).toBe(key2(name, scope));
    expect(plainKey(round, scope)).not.toBe(plainKey(name, scope));
    expect(keyText(round, scope, table)).not.toBe(keyText(name, scope, table));
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

  it("V-078: -0 is not 0 in each part of an expression that holds a number", () => {
    expect(key(lit([-0]))).not.toBe(key(lit([0])));
    expect(key(lit({ a: -0 }))).not.toBe(key(lit({ a: 0 })));
    expect(key({ tag: "ext", kind: "k", data: -0 })).not.toBe(key({ tag: "ext", kind: "k", data: 0 }));
    expect(key({ tag: "ext", kind: "k", data: [-0] })).not.toBe(key({ tag: "ext", kind: "k", data: [0] }));
    expect(key(ref("n", [{ t: "offset", d: [-0] }]))).not.toBe(key(ref("n", [{ t: "offset", d: [0] }])));
    expect(key(app("abs", lit(-0)))).not.toBe(key(app("abs", lit(0))));
    expect(key(lit(-0))).toBe(key(lit(-0)));
  });

  it("V-078: a literal of a number, a text or a truth value has one key for each value", () => {
    expect(key(lit(1))).toBe(key(lit(1)));
    expect(key(lit(1))).not.toBe(key(lit(2)));
    expect(key(lit(1))).not.toBe(key(lit("1")));
    expect(key(lit(true))).not.toBe(key(lit("true")));
    expect(key(lit(null))).not.toBe(key(lit("null")));
    // An extension with the data of a literal is not that literal.
    expect(key(lit(1))).not.toBe(key({ tag: "ext", kind: "k", data: 1 }));
  });

  it("V-078: a key reads a field with the name __proto__ as each other field", () => {
    const named = (e: Expr): Expr => rec(JSON.parse(`{"__proto__":${JSON.stringify(e)}}`) as Readonly<Record<string, Expr>>);
    expect(key(named(lit(1)))).not.toBe(key(named(lit(2))));
    expect(key(named(lit(1)))).not.toBe(key(rec({})));
    expect(key(named(lit(1)))).toBe(key(named(lit(1))));
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
