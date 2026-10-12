import { evaluate, isVexList, space, vex, type Expr } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { ChainError, parseChain, programOf, runChain, tokenize } from "./chain-parser.ts";

const boxes = space.record({
  A: { position: new Vec2(0, 0), size: new Vec2(2, 2), weight: 2 },
  B: { position: new Vec2(3, 4), size: new Vec2(1, 1), weight: 3 },
  C: { position: new Vec2(6, 8), size: new Vec2(1, 1), weight: 5 },
});
const root = vex(Vec2Domain, NumDomain).over(boxes);
const program = (src: string): { readonly program: unknown } => runChain(parseChain(src), { root }) as { readonly program: unknown };
const valueAt = (src: string, k: "A" | "B" | "C"): unknown => {
  const c = runChain(parseChain(src), { root }) as { result(k: string): { ok: boolean; value?: unknown } };
  const r = c.result(k);
  return r.ok ? r.value : "error";
};
const fails = (src: string): ChainError => {
  try {
    runChain(parseChain(src), { root });
  } catch (e) {
    if (e instanceof ChainError) return e;
    throw e;
  }
  throw new Error(`no error for ${src}`);
};

const programFails = (src: string): ChainError => {
  try {
    programOf(runChain(parseChain(src), { root }), src);
  } catch (e) {
    if (e instanceof ChainError) return e;
    throw e;
  }
  throw new Error(`no error for ${src}`);
};

describe("the chain reader of the Lab", () => {
  it("reads a chain with ops, an axis, an arrow function and a reduction", () => {
    expect(valueAt(`root.from("position").others((e) => e._.subtract("position")._.length()).min()`, "A")).toBe(5);
    expect(valueAt(`root.from("position").others(e => e._.distance("position")).min()`, "B")).toBe(5);
  });

  it("reads a number with an exponent and a sign, like TypeScript", () => {
    expect(valueAt(`root.start(1e-7)`, "A")).toBe(1e-7);
    expect(valueAt(`root.start(2.5E+3)`, "A")).toBe(2500);
    expect(valueAt(`root.start(1_000)`, "A")).toBe(1000);
  });

  it("reads const lines, comments, numbers, booleans, objects and arrays", () => {
    const src = `// the far corner
const corner = root.from("position")._.add("size");
corner._.scale(2)`;
    expect(valueAt(src, "A")).toEqual(new Vec2(4, 4));
    expect(valueAt(`root.from("weight")._.add(-1.5)`, "C")).toBe(3.5);
    expect(valueAt(`root.start(0).others((e) => e.from("weight")).max({ strict: true })`, "A")).toBe(5);
    expect(valueAt(`root.start(root.lit([1, 2, 3]))`, "A")).toEqual([1, 2, 3]);
    expect(valueAt(`root.start(true)`, "A")).toBe(true);
    expect(valueAt(`root.start(root.rec({ w: "weight", k: root.lit('kind'), n: null }))`, "A")).toEqual({ w: 2, k: "kind", n: null });
  });

  it("gives a list for an axis without a reduction", () => {
    const c = program(`root.start(0).others((e) => e.from("weight"))`);
    const r = evaluate(c.program as Expr, { space: boxes, origin: "A", domains: [Vec2Domain, NumDomain] });
    expect(r.ok && isVexList(r.value)).toBe(true);
  });

  it("gives the position of each error", () => {
    expect(fails(`root.from("position").`).message).toMatch(/name is necessary/);
    expect(fails(`root.from("position"`).message).toMatch(/is necessary/);
    expect(fails(`root.frm("x")`).span).toEqual({ start: 5, end: 8 });
    expect(fails(`nope.from("x")`).message).toMatch(/not defined/);
    expect(fails(`"open`).message).toMatch(/no end/);
    expect(fails(`root.start(1) 2`).message).toMatch(/more text/);
    expect(fails(`root.start(\`a\${x}\`)`).message).toMatch(/template/);
    expect(fails(`root.start(#)`).message).toMatch(/not part of a Vex chain/);
  });

  it("does not reach a constructor, a prototype or a global", () => {
    expect(fails(`root.constructor`).message).toMatch(/not a member/);
    expect(fails(`root.from("x").constructor`).message).toMatch(/not a member/);
    expect(fails(`root.from("x")._.constructor`).message).toMatch(/not an op name/);
    expect(fails(`root.from("x")._.__proto__`).message).toMatch(/not an op name/);
    expect(fails(`root.from("x")._.call`).message).toMatch(/not an op name/);
    expect(fails(`root.from.call(root, "x")`).message).toMatch(/needs a root, a chain or a list chain/);
    expect(fails(`window.alert(1)`).message).toMatch(/not defined/);
    expect(fails(`globalThis`).message).toMatch(/not defined/);
    expect(fails(`const constructor = 1; root`).message).toMatch(/not a name/);
    expect(fails(`root.start({ __proto__: 1 })`).message).toMatch(/not a field name/);
    expect(fails(`root.start(1).at("A")`).message).toMatch(/not a member/);
    expect(() => tokenize("a".repeat(10))).not.toThrow();
    expect(fails("root." + "x".repeat(7000)).message).toMatch(/too long/);
  });
});

describe("the program of a chain", () => {
  it("gives the expression of a chain and of a list chain", () => {
    const src = `root.from("position").others((e) => e._.distance("position"))`;
    expect(programOf(runChain(parseChain(src), { root }), src).tag).toBe("let");
    expect(programOf(runChain(parseChain(`${src}.min()`), { root }), src).tag).toBe("app");
  });

  it("gives an error for an unfinished chain, an op without a call or a plain value", () => {
    expect(programFails(`root.from("weight")._`).message).toMatch(/op name is necessary/);
    expect(programFails(`root.from("weight")._`).span).toEqual({ start: 20, end: 21 });
    expect(programFails(`root.from("weight")._.add`).message).toMatch(/without a call/);
    expect(programFails(`root.from`).message).toMatch(/without a call/);
    expect(programFails(`1`).message).toMatch(/must end with a chain/);
    expect(programFails(`root.lit`).message).toMatch(/without a call/);
  });
});

describe("the presets of the Lab", () => {
  it("each preset reads, builds and evaluates without an exception", async () => {
    const { LAB_SPACES } = await import("./lab-spaces.ts");
    const { INITIAL_BOXES } = await import("./specimen.ts");
    for (const s of LAB_SPACES) {
      const { space: sp, root: r } = s.make(INITIAL_BOXES);
      for (const p of s.presets) {
        const chain = runChain(parseChain(p.code), { root: r }) as { readonly program: Expr };
        for (const k of sp.keys) {
          const res = evaluate(chain.program, { space: sp, origin: k, domains: s.domains });
          expect(res.ok || res.error.code.startsWith("#"), `${s.id}/${p.id} at ${k}`).toBe(true);
        }
        // At least one key gives a value, so the preset shows something.
        expect(sp.keys.some((k) => evaluate(chain.program, { space: sp, origin: k, domains: s.domains }).ok), `${s.id}/${p.id}`).toBe(true);
      }
    }
  });
});
