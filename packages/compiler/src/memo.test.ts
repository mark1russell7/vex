import { app, axes, each, let_, lit, ref, v, type Addr, type Expr } from "@mark1russell7/vex";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isFusedOp } from "./facts.ts";
import { plainMemoNodes } from "../test/plain-memo.ts";
import { memoNodes } from "./memo.ts";

const n = ref("n");
const SUM_N = app("sum", each(axes.all, n));
const ORIGIN_N = ref("n", [{ t: "origin" }]);

/** This function gives the count of each read of the form of a node in a call of `memoNodes`. */
function walkOf(make: (seen: (e: Expr) => Expr) => Expr): number {
  let count = 0;
  const seen = (e: Expr): Expr =>
    new Proxy(e, {
      get(target, key, receiver): unknown {
        if (key === "tag") count++;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  memoNodes(make(seen));
  return count;
}

/** This function gives the growth of the walk when a program of `size` levels gets 2 times its levels. */
function growth(size: number, level: (x: Expr, i: number) => Expr, leaf: Expr): number {
  const chain = (levels: number) => (seen: (e: Expr) => Expr): Expr => {
    let e = seen(leaf);
    for (let i = 0; i < levels; i++) e = seen(level(e, i));
    return e;
  };
  return walkOf(chain(size * 2)) / walkOf(chain(size));
}

/** The moves of the addresses of the generated programs. A computed move holds a program of its own. */
const moves = (x: fc.Arbitrary<Expr>): fc.Arbitrary<Addr> =>
  fc.oneof<fc.Arbitrary<Addr>[]>(fc.constant([]), fc.constant([{ t: "origin" }]), fc.constant([{ t: "key", key: "k" }]), fc.constant([{ t: "parent" }]), fc.constant([{ t: "origin" }, { t: "parent" }]), x.map((value) => [{ t: "key", key: value }]));

/** The programs of the test of the reference: each form that the analysis reads, with few names, so a name can shadow a name. */
const programs: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => {
  const e = tie("e");
  const name = fc.constantFrom("a", "b", "c");
  return {
    e: fc.oneof(
      { depthSize: "small", maxDepth: 6 },
      fc.constant(lit(1)),
      name.map((x) => v(x)),
      fc.tuple(fc.constantFrom("n", "w"), moves(e)).map(([field, at]) => ref(field, at)),
      fc.tuple(fc.constantFrom("add", "sum", "max"), fc.array(e, { minLength: 1, maxLength: 2 })).map(([op, args]) => app(op, ...args)),
      fc.tuple(name, e, e).map(([x, bound, body]) => let_({ [x]: bound }, body)),
      fc.tuple(e, moves(e), fc.option(e, { nil: undefined })).map(([body, at, test]) => each(test === undefined ? axes.all : axes.where(axes.all, test), body, at)),
      fc.tuple(e, e).map(([a, b]) => ({ tag: "rec", fields: { a, b } }) as Expr),
    ),
  };
}).e;

/** This function gives the flat list of the nodes and the keys of an analysis. */
const flat = (memo: ReadonlyMap<Expr, readonly Expr[]>): readonly (Expr | number)[] => [...memo].flatMap(([e, keys]) => [e, keys.length, ...keys]);

describe("the memo", () => {
  it("V-087 COMPILE.MEMO: the walk of a chain with no loop grows with the chain", () => {
    expect(growth(200, (x) => app("add", x, n), n)).toBeLessThan(2.2);
  });

  it("V-087 COMPILE.MEMO: the walk of a chain over a loop grows with the chain", () => {
    expect(growth(200, (x) => app("add", x, n), SUM_N)).toBeLessThan(2.2);
  });

  it("V-087 COMPILE.MEMO: the walk of a chain of loops grows with the chain", () => {
    expect(growth(200, (x) => app("sum", each(axes.all, app("add", x, n))), n)).toBeLessThan(2.2);
  });

  it("V-087 COMPILE.MEMO: the walk of a chain of lets grows with the chain", () => {
    expect(growth(200, (x, i) => let_({ [`x${String(i)}`]: n }, app("add", x, v(`x${String(i)}`))), n)).toBeLessThan(2.2);
  });

  it("V-087 COMPILE.MEMO: a program of many names does not change the result of the reference", () => {
    let e: Expr = SUM_N;
    for (let i = 0; i < 80; i++) e = let_({ [`x${String(i)}`]: ORIGIN_N }, app("add", e, v(`x${String(i)}`)));
    expect(flat(memoNodes(e))).toStrictEqual(flat(plainMemoNodes(e)));
  });

  it("V-087 COMPILE.MEMO: the generated programs reach the nodes of the memo", () => {
    const found = fc.sample(programs, { seed: 87, numRuns: 1000 }).filter((e) => memoNodes(e).size > 0);
    expect(found.length).toBeGreaterThan(100);
  });

  it("V-087 COMPILE.MEMO: over generated programs, the analysis gives the nodes and the keys of the reference, in one order", () => {
    fc.assert(
      fc.property(programs, fc.boolean(), (e, fused) => {
        const loops = fused ? isFusedOp : undefined;
        const got = flat(memoNodes(e, loops));
        const plain = flat(plainMemoNodes(e, loops));
        expect(got.length).toBe(plain.length);
        expect(got.filter((x, i) => x !== plain[i])).toStrictEqual([]);
      }),
    );
  });
});
