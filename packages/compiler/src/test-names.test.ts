/** The gate of the names of a printed module. */
import { describe, expect, it } from "vitest";
import { MODULE_GLOBALS } from "./module.ts";
import { nameFaults, namesOfText } from "./test-names.ts";

const freeOf = (source: string): readonly string[] => [...namesOfText(source).free.keys()];

describe("the names of the text of a module", () => {
  it("V-081: a read of a variable of another function has no declaration", () => {
    expect(nameFaults("const f = (p) => { const Q = (k) => R[o2].n; return Q(p); };\nexport const R = [];", MODULE_GLOBALS)).toStrictEqual(["line 1: the name o2 has no declaration"]);
  });

  it("gives no fault for each kind of declaration", () => {
    const text = `
      import { a } from "x";
      var v1 = 1;
      function f(p, { q, r: [s, ...t], ...u } = {}, w = p) { var h = 1; { var i = h; } return [p, q, s, t, u, w, i, g]; }
      function g() { return [c1, f]; }
      const c1 = 1, [d1, { e1 }] = [1, {}];
      class K extends Object { m() { return K; } x = 1; [c1]() {} }
      const e2 = function named() { return named; };
      for (let i = 0; i < 2; i++) { lab: for (const j of [i]) { if (j) continue lab; break lab; } }
      for (const k in {}) k;
      try { f(); } catch (err) { f(err); }
      try { f(); } catch { f(); }
      switch (c1) { case 1: { const y = 1; f(y); } default: let z = 1; f(z); }
      const o = { a: 1, c1, [d1]: e1, get b() { return v1; } };
      export { o, e2 };
      export const last = o.a;
    `;
    expect(nameFaults(text, new Set(["Object", "a"]))).toStrictEqual([]);
  });

  it("finds a name in each kind of place", () => {
    expect(freeOf("const a = { [b]: c, d: e }; a[f]; a.g; h(); class K extends i { [j]() { return k; } l = m; }")).toStrictEqual(["b", "c", "e", "f", "h", "i", "j", "k", "m"]);
    expect(freeOf("const [x = a, { [b]: y = c, ...z }, ...w] = []; for (const q of r) s; switch (t) { case u: v; }")).toStrictEqual(["a", "b", "c", "r", "s", "t", "v", "u"]);
    expect(freeOf("function f(p = a, [q = b]) { return p + q; } const g = (...r) => r; try { c; } catch ({ m }) { m; d; }")).toStrictEqual(["a", "b", "c", "d"]);
  });

  it("a name outside its block has no declaration", () => {
    expect(freeOf("{ const a = 1; } a; for (let i = 0; i < 1; i++); i; try { } catch (e) { } e;")).toStrictEqual(["a", "i", "e"]);
  });

  it("finds a read before a declaration in the same function, and misses a read through a closure", () => {
    expect(nameFaults("x; const x = 1;\nconst y = y + 1;", MODULE_GLOBALS)).toStrictEqual(["line 1: a read of x before its declaration", "line 2: a read of y before its declaration"]);
    expect(nameFaults("const f = () => x; f(); const x = 1;", MODULE_GLOBALS)).toStrictEqual([]);
  });

  it("a global of the host is not a fault of a name", () => {
    expect(nameFaults("Math.abs(1); Fetch(1);", MODULE_GLOBALS)).toStrictEqual(["line 1: the name Fetch has no declaration"]);
  });
});
