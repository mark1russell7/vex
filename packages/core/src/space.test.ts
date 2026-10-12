import { describe, expect, it } from "vitest";
import { axes, index, key, offset, origin, other, parent } from "./ir.ts";
import { applyMove, axisTargets, resolveAddr, space } from "./space.ts";
import { error, value } from "./test-support.ts";

describe("spaces", () => {
  it("record: keys in insertion order, get, has", () => {
    const s = space.record({ A: { n: 1 }, B: { n: 2 } });
    expect(s.kind).toBe("record");
    expect(s.keys).toEqual(["A", "B"]);
    expect(s.get("B")).toEqual({ n: 2 });
    expect(s.has("C")).toBe(false);
    expect(s.coords("A")).toBeUndefined();
  });

  it("array: keys are indexes as strings, and the space copies its input", () => {
    const items = [{ n: 1 }, { n: 2 }];
    const s = space.array(items);
    items.push({ n: 3 });
    expect(s.keys).toEqual(["0", "1"]);
    expect(s.get("1")).toEqual({ n: 2 });
    expect(s.has("01")).toBe(false);
    expect(s.has("2")).toBe(false);
  });

  it("grid: keys are row,column and ragged rows have no missing keys", () => {
    const s = space.grid([[1, 2], [3]]);
    expect(s.keys).toEqual(["0,0", "0,1", "1,0"]);
    expect(s.get("1,0")).toBe(3);
    expect(s.has("1,1")).toBe(false);
    expect(s.coords("0,1")).toEqual([0, 1]);
  });
});

describe("moves (NAV.*)", () => {
  const pair = space.record({ A: 1, B: 2 });
  const three = space.record({ A: 1, B: 2, C: 3 });
  const at = { origin: "A", focus: "A" };

  it("NAV.KEY: a key move goes to the key, an unknown key gives #REF! (V-004)", () => {
    expect(value(applyMove(pair, at, key("B")))).toBe("B");
    const e = error(applyMove(pair, at, key("Z")));
    expect(e.code).toBe("#REF!");
    expect(e.kind).toBe("unknown-key");
  });

  it("NAV.OTHER.PAIR: other is valid only in a space with two keys (V-005)", () => {
    expect(value(applyMove(pair, at, other))).toBe("B");
    expect(value(applyMove(pair, { origin: "A", focus: "B" }, other))).toBe("A");
    expect(error(applyMove(three, at, other)).kind).toBe("not-a-pair");
  });

  it("NAV.ORIGIN: origin goes back to the start of the run (V-040)", () => {
    expect(value(resolveAddr(pair, at, [other, origin]))).toBe("A");
  });

  it("NAV.INDEX: index uses the key order", () => {
    expect(value(applyMove(three, at, index(2)))).toBe("C");
    expect(error(applyMove(three, at, index(3))).kind).toBe("out-of-bounds");
    expect(error(applyMove(three, at, index(-1))).kind).toBe("out-of-bounds");
  });

  it("NAV.OFFSET: offsets move in arrays and grids, and give #REF! outside them (V-019)", () => {
    const arr = space.array(["a", "b", "c"]);
    expect(value(applyMove(arr, { origin: "1", focus: "1" }, offset(1)))).toBe("2");
    expect(error(applyMove(arr, { origin: "2", focus: "2" }, offset(1))).kind).toBe("out-of-bounds");
    const grid = space.grid([[1, 2], [3, 4]]);
    expect(value(applyMove(grid, { origin: "0,0", focus: "0,0" }, offset(1, 1)))).toBe("1,1");
    expect(error(applyMove(grid, { origin: "0,0", focus: "0,0" }, offset(1))).kind).toBe("no-offset");
    expect(error(applyMove(pair, at, offset(1))).kind).toBe("no-offset");
  });

  it("NAV.OFFSET.TREE: in a tree space, an offset moves among the siblings in key order", () => {
    const t = space.tree({ a: 1, a1: 2, a2: 3, a3: 4, b: 5 }, { a1: "a", a2: "a", a3: "a" });
    const go = (k: string, d: number): string => {
      const r = applyMove(t, { origin: k, focus: k }, offset(d));
      return r.ok ? r.value : r.error.kind ?? r.error.code;
    };
    expect([go("a2", -1), go("a2", 1), go("a1", 2)]).toEqual(["a1", "a3", "a3"]);
    // The roots are siblings. An offset past the first or the last sibling gives #REF!.
    expect([go("a", 1), go("b", -1)]).toEqual(["b", "a"]);
    expect([go("a1", -1), go("a3", 1), go("b", 1)]).toEqual(["out-of-bounds", "out-of-bounds", "out-of-bounds"]);
    // An offset with two numbers is not valid in a tree.
    expect(error(applyMove(t, { origin: "a", focus: "a" }, offset(1, 1))).kind).toBe("no-offset");
  });

  it("NAV.SEQUENCE: moves apply in order, and a failed move fails the address", () => {
    expect(value(resolveAddr(pair, at, [other, other]))).toBe("A");
    expect(error(resolveAddr(three, at, [other, other])).kind).toBe("not-a-pair");
    expect(error(resolveAddr(pair, at, [key("Z"), key("A")])).kind).toBe("unknown-key");
  });
});

describe("axes (AXIS.*)", () => {
  const three = space.record({ A: 1, B: 2, C: 3 });
  const at = { origin: "B", focus: "B" };

  it("AXIS.ALL and AXIS.OTHERS", () => {
    expect(value(axisTargets(three, at, { t: "all" }))).toEqual(["A", "B", "C"]);
    expect(value(axisTargets(three, at, { t: "others" }))).toEqual(["A", "C"]);
  });

  it("AXIS.NEIGHBORS: 4 and 8 neighbors in a grid, #REF! in other spaces", () => {
    const g = space.grid([[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
    const centre = { origin: "1,1", focus: "1,1" };
    expect(value(axisTargets(g, centre, { t: "neighbors", n: 4 }))).toEqual(["0,1", "1,0", "1,2", "2,1"]);
    expect(value(axisTargets(g, centre, { t: "neighbors", n: 8 }))).toHaveLength(8);
    expect(value(axisTargets(g, { origin: "0,0", focus: "0,0" }, { t: "neighbors", n: 8 }))).toEqual(["0,1", "1,0", "1,1"]);
    expect(error(axisTargets(three, at, { t: "neighbors", n: 4 })).kind).toBe("no-grid");
  });
});

describe("the edges of the spaces", () => {
  it("a key that is not in the space has no coordinates and no record", () => {
    const a = space.array([10, 20]);
    expect(a.coords("2")).toBeUndefined();
    expect(a.get("x")).toBeUndefined();
    expect(a.keyAt([1])).toBe("1");
    expect(a.keyAt([1, 0])).toBeUndefined();
    const g = space.grid([[1, 2]]);
    expect(g.coords("1,0")).toBeUndefined();
    expect(g.keyAt([0])).toBeUndefined();
    expect(g.keyAt([0, -1])).toBeUndefined();
    const r = space.record({ A: 1 });
    expect(r.keyAt([0])).toBeUndefined();
  });

  it("NAV.OTHER.PAIR: other goes both ways in a pair", () => {
    const pair = space.record({ A: 1, B: 2 });
    expect(value(applyMove(pair, { origin: "B", focus: "B" }, other))).toBe("A");
  });
});

const here = (k: string): { readonly origin: string; readonly focus: string } => ({ origin: k, focus: k });

describe("tree spaces (SPACE.TREE, NAV.PARENT, AXIS.TREE)", () => {
  // root ─┬─ a ─┬─ a1
  //       │     └─ a2
  //       └─ b
  // solo (a second root)
  const t = space.tree({ root: 1, a: 2, a1: 3, a2: 4, b: 5, solo: 6 }, { a: "root", a1: "a", a2: "a", b: "root", root: null });
  const targets = (k: string, axis: Parameters<typeof axisTargets>[2]) => value(axisTargets(t, here(k), axis));

  it("SPACE.TREE: a tree space keeps the key order, and its parents and children", () => {
    expect(t.kind).toBe("tree");
    expect(t.keys).toEqual(["root", "a", "a1", "a2", "b", "solo"]);
    expect(t.get("a1")).toBe(3);
    expect(t.parentOf?.("a1")).toBe("a");
    expect(t.parentOf?.("root")).toBeUndefined();
    expect(t.childrenOf?.("root")).toEqual(["a", "b"]);
    expect(t.childrenOf?.("zzz")).toEqual([]);
    expect(t.coords("a")).toBeUndefined();
    expect(t.keyAt([0])).toBeUndefined();
  });

  it("SPACE.TREE: a parent that is not a key, a key that is not in the tree, and a cycle throw", () => {
    expect(() => space.tree({ a: 1 }, { a: "nope" as "a" })).toThrow(TypeError);
    expect(() => space.tree({ a: 1 }, { zzz: "a" } as never)).toThrow(TypeError);
    expect(() => space.tree({ a: 1, b: 2, c: 3 }, { a: "c", b: "a", c: "b" })).toThrow(/cycle/);
    expect(() => space.tree({ a: 1 }, { a: "a" })).toThrow(/cycle/);
  });

  it("NAV.PARENT: parent goes to the parent, a root gives #REF!, and other spaces give #REF!", () => {
    expect(value(applyMove(t, here("a2"), parent))).toBe("a");
    expect(value(resolveAddr(t, here("a2"), [parent, parent]))).toBe("root");
    expect(error(applyMove(t, here("root"), parent))).toMatchObject({ code: "#REF!", kind: "out-of-bounds" });
    expect(error(applyMove(space.record({ A: 1 }), here("A"), parent))).toMatchObject({ code: "#REF!", kind: "no-tree" });
  });

  it("AXIS.TREE: children, ancestors, descendants and siblings", () => {
    expect(targets("root", axes.children as never)).toEqual(["a", "b"]);
    expect(targets("a2", axes.ancestors as never)).toEqual(["a", "root"]);
    expect(targets("root", axes.ancestors as never)).toEqual([]);
    expect(targets("root", axes.descendants as never)).toEqual(["a", "a1", "a2", "b"]);
    expect(targets("a1", axes.siblings as never)).toEqual(["a2"]);
    expect(targets("root", axes.siblings as never)).toEqual(["solo"]);
    expect(targets("b", axes.descendants as never)).toEqual([]);
    expect(error(axisTargets(space.record({ A: 1 }), here("A"), axes.children as never))).toMatchObject({ code: "#REF!", kind: "no-tree" });
  });

  it("AXIS.TREE: a deep tree does not need a deep call stack", () => {
    const n = 20000;
    const records = Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    const parents = Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [`k${i + 1}`, `k${i}`]));
    const deep = space.tree(records, parents);
    expect(value(axisTargets(deep, here("k0"), axes.descendants as never))).toHaveLength(n - 1);
  });
});
