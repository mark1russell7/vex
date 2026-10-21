import { app, axisTargets, cell, compile, each, evaluate, explain, fromDocument, isExpr, lit, parse, ref, resolveAddr, serialize, shapeError, SheetRun, space, toDocument, vex, type Axis, type Expr, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbExpr, arbGraphInput, arbMove, arbOrigin, arbSpace, arbTreeInput, PATHS } from "./arbitraries.ts";
import { fromCore, fromReference } from "./compare.ts";
import { structuralEqual } from "./laws.ts";
import { referenceEvaluate } from "./reference.ts";

const DOMAINS = [Vec2Domain, NumDomain, BoolDomain] as const;
const vec = fc.tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 })).map(([x, y]) => new Vec2(x, y));
const OPTS = { domainValue: vec, ops: ["add", "subtract", "scale", "length", "dot", "divide", "multiply", "anyNonPositive", "gt", "not", "and"] };

/**
 * A space, an expression, an origin (sometimes an origin that is not in the space), and the table "T" for the axis
 * table (AXIS.TABLE).
 */
const program = arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbExpr(OPTS), arbOrigin(s), arbSpace(vec).map((t) => ({ T: t }))));

const run = (e: Expr, s: Space, origin: string, tables?: Readonly<Record<string, Space>>): ReturnType<typeof evaluate> =>
  evaluate(e, { space: s, origin, domains: DOMAINS, ...(tables === undefined ? {} : { tables }) });

/** The axis table "T" with a test: the boolean of `e`, or an error for a value that is not a boolean. */
const tableWhere = (e: Expr): Axis => ({ t: "where", axis: { t: "table", name: "T" }, test: app("not", app("not", e)) });

describe("properties of the interpreter", () => {
  it("P1 EVAL.TOTAL: evaluation does not throw, and a value is never undefined (V-009, V-022, V-041)", () => {
    fc.assert(
      fc.property(program, ([s, e, k, tables]) => {
        const r = run(e, s, k, tables);
        expect(r.ok ? r.value !== undefined : r.error.code.startsWith("#")).toBe(true);
      }),
    );
  });

  it("EVAL.SHAPE V-053: an expression with a part that is not valid gives #VALUE! with its reason, and does not throw", () => {
    // The class of V-053: a walk of the IR trusts the types. This generator gives a part that is not valid: a node of a
    // newer version of Vex, a node with a missing part, an axis that is not valid, or any other value.
    const badPart = fc.oneof(
      fc.string().map((tag) => ({ tag })),
      fc.constantFrom({ tag: "app", op: "add" }, { tag: "let", bind: [] }, { tag: "ref" }, { tag: "each", axis: { t: "diagonal" }, body: lit(1) }),
      fc.anything().filter((u) => !isExpr(u)),
    );
    fc.assert(
      fc.property(program, badPart, fc.boolean(), ([s, e, k, tables], part, first) => {
        const bad = app("add", ...(first ? [part as Expr, e] : [e, part as Expr]));
        const reason = shapeError(bad);
        expect(reason).toBeDefined();
        const r = run(bad, s, k, tables);
        const expected = s.has(k) ? ["#VALUE!", "bad-expression", reason] : ["#REF!", "unknown-key", `the space has no key "${k}"`];
        expect(r.ok ? r : [r.error.code, r.error.kind, r.error.message]).toEqual(expected);
      }),
    );
  });

  it("P2 EVAL.PURE: two evaluations agree, and explain gives the same result (V-004, V-010)", () => {
    fc.assert(
      fc.property(program, ([s, e, k, tables]) => {
        const first = fromCore(run(e, s, k, tables));
        expect(fromCore(run(e, s, k, tables))).toEqual(first);
        expect(fromCore(explain(e, { space: s, origin: k, domains: DOMAINS, tables }).result)).toEqual(first);
      }),
    );
  });

  it("P8 EVAL.REFERENCE AXIS.TABLE: the core interpreter and the reference interpreter agree", () => {
    fc.assert(
      fc.property(program, ([s, e, k, tables]) => {
        const core = fromCore(run(e, s, k, tables));
        const reference = fromReference(referenceEvaluate(e, { space: s, origin: k, domains: DOMAINS, tables }));
        expect(core).toEqual(reference);
      }),
    );
  });

  it("P10 EVAL.COMPILE: one compiled program runs on many spaces, and each run agrees with the reference interpreter", () => {
    fc.assert(
      fc.property(arbExpr(OPTS), fc.array(arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbOrigin(s))), { minLength: 1, maxLength: 4 }), (e, runs) => {
        const compiled = compile(e, { domains: DOMAINS });
        for (const [s, k] of runs) {
          const tables = { T: s };
          expect(fromCore(compiled.run({ space: s, origin: k, tables }))).toEqual(fromReference(referenceEvaluate(e, { space: s, origin: k, domains: DOMAINS, tables })));
        }
      }),
    );
  });

  it("P13 EVAL.COMPILE IR.JSON: evaluate, compile, explain, the reference and a JSON round trip give one result", () => {
    fc.assert(
      fc.property(program, ([s, e, k, tables]) => {
        const expected = fromCore(run(e, s, k, tables));
        // A program with a number that is not finite has no JSON form, so that path gives the expected result.
        const text = serialize(e, DOMAINS);
        const back = text.ok ? parse(text.value, DOMAINS) : undefined;
        const json = back === undefined ? expected : back.ok ? fromCore(run(back.value, s, k, tables)) : { ok: false, code: "no parse" };
        expect({
          compile: fromCore(compile(e, { domains: DOMAINS }).run({ space: s, origin: k, tables })),
          explain: fromCore(explain(e, { space: s, origin: k, domains: DOMAINS, tables }).result),
          reference: fromReference(referenceEvaluate(e, { space: s, origin: k, domains: DOMAINS, tables })),
          json,
        }).toEqual({ compile: expected, explain: expected, reference: expected, json: expected });
      }),
    );
  });

  it("P18 DOC.ROUND-TRIP DOC.ENTRY: an expression gives itself after its document, also through JSON text, and its document gives its result", () => {
    fc.assert(
      fc.property(program, ([s, e, k, tables]) => {
        // Each literal of the arbitraries has a JSON form: JSON data, a number that JSON has no text for, or a Vec2.
        const d = toDocument(e, DOMAINS);
        if (!d.ok) throw new Error(d.error.message);
        expect(fromDocument(d.value, DOMAINS)).toEqual({ ok: true, value: e });
        expect(fromDocument(JSON.parse(JSON.stringify(d.value)), DOMAINS)).toEqual({ ok: true, value: e });
        expect(fromCore(evaluate(d.value, { space: s, origin: k, domains: DOMAINS, tables }))).toEqual(fromCore(run(e, s, k, tables)));
      }),
    );
  });

  it("P15 AXIS.TABLE: inside the axis table, the origin is the target, in the body and in the test of where", () => {
    fc.assert(
      fc.property(program, fc.constantFrom(...PATHS), ([s, , k, tables], path) => {
        const at = (e: Expr): unknown => fromCore(run(e, s, k, tables));
        const atOrigin = ref(path, [{ t: "origin" }]);
        const atFocus = ref(path);
        expect(at(each({ t: "table", name: "T" }, atOrigin))).toEqual(at(each({ t: "table", name: "T" }, atFocus)));
        expect(at(each(tableWhere(atOrigin), lit(1)))).toEqual(at(each(tableWhere(atFocus), lit(1))));
      }),
    );
  });

  it("P6 IR.JSON: an expression with JSON literals round-trips through JSON", () => {
    fc.assert(
      fc.property(arbExpr(OPTS), (e) => {
        const text = serialize(e, DOMAINS);
        // Only a number that is not finite has no JSON form.
        const nonFinite = JSON.stringify(e, (_k, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? "NONFINITE" : v)).includes("NONFINITE");
        const back = text.ok ? parse(text.value, DOMAINS) : undefined;
        // serialize after parse gives the same text. A comparison with JSON.stringify applies toJSON to a domain value,
        // so it compares the toJSON form with itself, and it did not find V-044.
        const again = text.ok && back?.ok === true ? serialize(back.value, DOMAINS) : undefined;
        const roundTrip = text.ok && again?.ok === true && structuralEqual(JSON.parse(again.value), JSON.parse(text.value));
        expect(text.ok ? roundTrip : nonFinite).toBe(true);
      }),
    );
  });
});

describe("properties of the axes", () => {
  const recordSpace = arbSpace(vec).filter((s) => s.kind === "record");
  const pathArb = fc.constantFrom(...PATHS);

  it("P5 AXIS.OTHERS-UNION: the others and the origin give the same items as all", () => {
    fc.assert(
      fc.property(recordSpace.chain((s) => fc.tuple(fc.constant(s), fc.constantFrom(...s.keys), pathArb)), ([s, k, path]) => {
        const keysOf = (r: ReturnType<typeof run>): readonly string[] => (r.ok ? (r.value as { items: readonly { key: string }[] }).items.map((i) => i.key) : []);
        const others = keysOf(run(each({ t: "others" }, ref(path)), s, k));
        const all = keysOf(run(each({ t: "all" }, ref(path)), s, k));
        expect([...others, k].toSorted()).toEqual([...all].toSorted());
      }),
    );
  });

  it("P5 AXIS.OTHER-TWICE: in a pair, other twice reads at the origin", () => {
    const pair = arbSpace(vec).filter((s) => s.kind === "record" && s.keys.length === 2);
    fc.assert(
      fc.property(pair.chain((s) => fc.tuple(fc.constant(s), fc.constantFrom(...s.keys), pathArb)), ([s, k, path]) => {
        expect(fromCore(run(ref(path, [{ t: "other" }, { t: "other" }]), s, k))).toEqual(fromCore(run(ref(path), s, k)));
      }),
    );
  });

  it("P5 AXIS.EXTEND: an item of each(all, e) equals e evaluated at that key (the comonad law extract . extend p = p)", () => {
    fc.assert(
      fc.property(program, ([s, e]) => {
        // The law holds for programs that do not read the origin, because inside an axis the origin stays.
        fc.pre(!JSON.stringify(e).includes('"t":"origin"'));
        const all = run(each({ t: "all" }, e), s, s.keys[0] ?? "");
        if (!all.ok) return;
        const items = (all.value as { items: readonly { key: string; result: ReturnType<typeof run> }[] }).items;
        for (const item of items) expect(fromCore(item.result)).toEqual(fromCore(run(e, s, item.key)));
      }),
    );
  });

  it("P12 AXIS.ADDRESS-EXTEND: an axis with an address equals the axis at the key of the address", () => {
    const axisArb = fc.constantFrom<Axis>({ t: "all" }, { t: "others" }, { t: "other" }, { t: "neighbors", n: 4 }, { t: "children" }, { t: "ancestors" }, { t: "siblings" });
    fc.assert(
      fc.property(program, axisArb, fc.array(arbMove, { minLength: 1, maxLength: 2 }), ([s, e, o], axis, at) => {
        // The law holds for bodies that do not read the origin, because inside an axis the origin stays. An origin
        // outside the space fails before the axis (EVAL.TOTAL), so the law starts at a key of the space.
        fc.pre(!JSON.stringify(e).includes('"t":"origin"') && s.keys.includes(o));
        const moved = resolveAddr(s, { origin: o, focus: o }, at);
        const withAddress = run(each(axis, e, at), s, o);
        // A failed address gives #REF!. Otherwise the list equals the axis at the key of the address.
        const expected = moved.ok ? fromCore(run(each(axis, e), s, moved.value)) : { ok: false, code: "#REF!" };
        expect(fromCore(withAddress)).toEqual(expected);
        expect(fromCore(withAddress)).toEqual(fromReference(referenceEvaluate(each(axis, e, at), { space: s, origin: o, domains: DOMAINS })));
      }),
    );
  });

  it("P7 LIST.REDUCE: for an associative op, any reduction tree equals the left fold", () => {
    const vectors = fc.array(vec, { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(vectors, fc.infiniteStream(fc.boolean()), (vs, choices) => {
        const flips = choices[Symbol.iterator]();
        const tree = (xs: readonly Vec2[]): Vec2 => {
          if (xs.length === 1) return xs[0] ?? Vec2.zero;
          const cut = 1 + ((flips.next().value ? 1 : 0) % (xs.length - 1));
          return tree(xs.slice(0, cut)).add(tree(xs.slice(cut)));
        };
        const s = space.array(vs.map((v) => ({ v })));
        const folded = run(app("reduce", each({ t: "all" }, ref("v")), lit("add")), s, "0");
        expect(folded.ok && folded.value).toEqual(tree(vs));
      }),
    );
  });
});

describe("properties of the builder", () => {
  it("P3 BUILD.IMMUTABLE: a later call does not change an earlier chain (V-010)", () => {
    const root = vex(Vec2Domain, NumDomain).over(space.record({ A: { p: new Vec2(1, 2), q: new Vec2(3, 4) }, B: { p: new Vec2(5, 6), q: new Vec2(7, 8) } }));
    type Step = "add" | "subtract" | "scale" | "other" | "origin" | "to";
    fc.assert(
      fc.property(fc.array(fc.constantFrom<Step>("add", "subtract", "scale", "other", "origin", "to"), { maxLength: 8 }), (steps) => {
        let chain = root.from("p");
        const seen: { readonly chain: typeof chain; readonly json: string }[] = [{ chain, json: JSON.stringify(chain.program) }];
        for (const step of steps) {
          chain =
            step === "add" ? chain._.add("q")
            : step === "subtract" ? chain._.subtract("p")
            : step === "scale" ? chain._.scale(2)
            : step === "other" ? chain.other()
            : step === "origin" ? chain.origin()
            : chain.to("B");
          seen.push({ chain, json: JSON.stringify(chain.program) });
        }
        for (const s of seen) expect(JSON.stringify(s.chain.program)).toBe(s.json);
      }),
    );
  });
});

describe("properties of sheets", () => {
  // A random sheet: four columns over three keys. Each formula adds a literal and up to two cell reads, and a
  // read can have a fallback with ifError. Thus the sheets have cycles, self references and caught errors.
  const COLUMNS = ["c0", "c1", "c2", "c3"] as const;
  const KEYS = ["A", "B", "C"] as const;
  const read = fc
    .tuple(fc.constantFrom(...COLUMNS), fc.option(fc.constantFrom(...KEYS), { nil: undefined }), fc.option(fc.integer({ min: -9, max: 9 }), { nil: undefined }))
    .map(([c, k, fallback]): Expr => {
      const r = cell(c, k === undefined ? [] : [{ t: "key", key: k }]);
      return fallback === undefined ? r : app("ifError", r, lit(fallback));
    });
  const formula = fc.tuple(fc.integer({ min: -9, max: 9 }), fc.array(read, { maxLength: 2 })).map(([n, reads]) => reads.reduce<Expr>((acc, r) => app("add", acc, r), lit(n)));
  const sheetArb = fc.tuple(formula, formula, formula, formula).map((fs) => new Map(COLUMNS.map((c, i) => [c, fs[i] ?? lit(0)])));
  const cells = KEYS.flatMap((k) => COLUMNS.map((c) => [c, k] as const));
  const s = space.record({ A: {}, B: {}, C: {} });

  it("P9 SHEET.ORDER: the result of each cell does not depend on the order of the evaluations", () => {
    fc.assert(
      fc.property(sheetArb, fc.shuffledSubarray(cells, { minLength: cells.length }), (columns, order) => {
        const inOrder = new SheetRun(columns, { space: s, domains: DOMAINS });
        const expected = cells.map(([c, k]) => fromCore(inOrder.cell(c, k)));
        const shuffled = new SheetRun(columns, { space: s, domains: DOMAINS });
        for (const [c, k] of order) shuffled.cell(c, k);
        expect(cells.map(([c, k]) => fromCore(shuffled.cell(c, k)))).toEqual(expected);
        // A fresh run for each cell gives the same result too.
        expect(cells.map(([c, k]) => fromCore(new SheetRun(columns, { space: s, domains: DOMAINS }).cell(c, k)))).toEqual(expected);
      }),
    );
  });
});

describe("properties of graph spaces", () => {
  // The laws read only the edges of the input, not the graph space, so they check the space independently.
  it("P16 SPACE.GRAPH AXIS.GRAPH: successors, predecessors and reachable follow from the edges", () => {
    fc.assert(
      fc.property(arbGraphInput(fc.constant(0)), (input) => {
        const s = space.graph(input.records, input.edges);
        const keys = Object.keys(input.records);
        const out = (k: string): string[] => [...new Set(input.edges[k] ?? [])];
        const targets = (k: string, t: "successors" | "predecessors" | "reachable"): readonly string[] => {
          const r = axisTargets(s, { origin: k, focus: k }, { t });
          return r.ok ? r.value : ["<error>"];
        };
        for (const k of keys) {
          expect(targets(k, "successors")).toEqual(out(k));
          expect(targets(k, "predecessors")).toEqual(keys.filter((x) => out(x).includes(k)));
          // Breadth first: a list of the keys at each distance from k, and k itself only as the start.
          const order: string[] = [];
          let level = [k];
          while (level.length > 0) {
            const next: string[] = [];
            for (const x of level) for (const y of out(x)) if (y !== k && !order.includes(y) && !next.includes(y)) next.push(y);
            order.push(...next);
            level = next;
          }
          expect(targets(k, "reachable")).toEqual(order);
        }
      }),
    );
  });

  it("P16 AXIS.GRAPH: in a tree space, the successors are the children and the predecessors are the parent", () => {
    fc.assert(
      fc.property(arbTreeInput(fc.constant(0)), (input) => {
        const s = space.tree(input.records, input.parents);
        for (const k of Object.keys(input.records)) {
          const of = (t: "successors" | "predecessors" | "children" | "ancestors"): unknown => axisTargets(s, { origin: k, focus: k }, { t });
          expect(of("successors")).toEqual(of("children"));
          const parent = input.parents[k] ?? null;
          expect(of("predecessors")).toEqual({ ok: true, value: parent === null ? [] : [parent] });
        }
      }),
    );
  });
});

/** This function gives the keys at the offsets from `from` to `to` of `k` in the list `group`. */
function windowOf(group: readonly string[], k: string, from: number, to: number): string[] {
  const out: string[] = [];
  const i = group.indexOf(k);
  for (let d = from; d <= to; d++) if (i + d >= 0 && i + d < group.length) out.push(group[i + d] ?? "");
  return out;
}

describe("properties of tree spaces", () => {
  // The laws read only the parents of the input, not the tree space, so they check the space independently.
  it("P11 AXIS.TREE: children, ancestors, descendants and siblings follow from the parents", () => {
    fc.assert(
      fc.property(arbTreeInput(fc.constant(0)), (input) => {
        const s = space.tree(input.records, input.parents);
        const keys = Object.keys(input.records);
        const parentOf = (k: string): string | null => input.parents[k] ?? null;
        const ancestorsOf = (k: string): string[] => {
          const out: string[] = [];
          for (let p = parentOf(k); p !== null; p = parentOf(p)) out.push(p);
          return out;
        };
        const targets = (k: string, t: "children" | "ancestors" | "descendants" | "siblings"): readonly string[] => {
          const r = axisTargets(s, { origin: k, focus: k }, { t });
          return r.ok ? r.value : ["<error>"];
        };
        for (const k of keys) {
          expect(targets(k, "children")).toEqual(keys.filter((x) => parentOf(x) === k));
          expect(targets(k, "ancestors")).toEqual(ancestorsOf(k));
          const descendants = targets(k, "descendants");
          expect([...descendants].toSorted()).toEqual(keys.filter((x) => ancestorsOf(x).includes(k)).toSorted());
          // Depth first: the parent of each descendant is the focus or comes before it.
          descendants.forEach((d, i) => expect(parentOf(d) === k || descendants.slice(0, i).includes(parentOf(d) ?? "")).toBe(true));
          expect(targets(k, "siblings")).toEqual(keys.filter((x) => x !== k && parentOf(x) === parentOf(k)));
          const up = resolveAddr(s, { origin: k, focus: k }, [{ t: "parent" }]);
          expect(up.ok ? up.value : null).toBe(parentOf(k));
        }
      }),
    );
  });

  it("P14 AXIS.WINDOW: a window has the keys at its offsets in the list of the siblings, or in the list of the keys of an array", () => {
    // The expected targets come from the parents and the key order only, so the check is independent of the space.
    const offsets = fc.integer({ min: -4, max: 4 });
    fc.assert(
      fc.property(arbTreeInput(fc.constant(0)), offsets, offsets, (input, from, to) => {
        const s = space.tree(input.records, input.parents);
        const keys = Object.keys(input.records);
        const parentOf = (k: string): string | null => input.parents[k] ?? null;
        for (const k of keys) {
          const r = axisTargets(s, { origin: k, focus: k }, { t: "window", from, to });
          expect(r.ok ? r.value : ["<error>"]).toEqual(windowOf(keys.filter((x) => parentOf(x) === parentOf(k)), k, from, to));
        }
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), offsets, offsets, (n, from, to) => {
        const s = space.array(Array.from({ length: n }, () => ({})));
        for (const k of s.keys) {
          const r = axisTargets(s, { origin: k, focus: k }, { t: "window", from, to });
          expect(r.ok ? r.value : ["<error>"]).toEqual(windowOf(s.keys, k, from, to));
        }
      }),
    );
  });
});
