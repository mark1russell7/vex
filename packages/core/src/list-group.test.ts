/**
 * The list ops `distinct`, `group` and `join` (LIST.DISTINCT, LIST.GROUP, LIST.JOIN) in tier 1 and in the kernel tier
 * (EVAL.REFERENCE). Each case runs in both tiers. The tiers give the same values and the same codes, and the messages of
 * each tier are pinned.
 */
import { describe, expect, it } from "vitest";
import { defineDomain } from "./domain.ts";
import { vexError } from "./errors.ts";
import { evaluate, type CompileOptions } from "./evaluate.ts";
import { app, axes, call, each, fn, let_, lit, ref, v, type Expr } from "./ir.ts";
import { isVexList, vexList, type ListItem, type VexList } from "./list.ts";
import { kernelPlan } from "./plan.ts";
import { fail, ok } from "./result.ts";
import { space } from "./space.ts";

const Num = defineDomain({ name: "Num", is: (u: unknown): u is number => typeof u === "number", ops: { add: { fn: (a: number, b: number): number => a + b } } });
const rows = space.array([{ s: "a", n: 1 }, { s: "b", n: 2 }, { s: "a", n: 3 }, { n: 4 }, { s: "c", n: 5 }, { s: "b", n: 6 }]);
const OPTS: CompileOptions = { domains: [Num] };
const strict = lit({ strict: true });
// The texts in key order: a, b, a, #N/A, c and b.
const ss = each(axes.all, ref("s"));
const ns = each(axes.all, ref("n"));
const none = each(axes.where(axes.all, lit(false)), ref("n"));
const deep: VexList = vexList([{ key: "0", result: fail(vexError("depth", "the call stack is full")) }]);

/** This function gives a plain form of a value: a list as its pairs of a key and a value, and an error as its code. */
function plain(x: unknown): unknown {
  if (!isVexList(x)) return x;
  return x.items.map((item) => [item.key, item.result.ok ? plain(item.result.value) : item.result.error.code]);
}

/** This function gives the plain value, or the code and the message of the error, of a result. */
const shown = (r: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }): unknown => (r.ok ? plain(r.value) : [r.error.code, r.error.message]);

/** This function gives the result of tier 1 and of the kernel tier for an expression. */
function both(e: Expr, vars: Readonly<Record<string, unknown>> = {}, opts: CompileOptions = OPTS): readonly [unknown, unknown] {
  return [shown(evaluate(e, { ...opts, space: rows, origin: "0", vars })), shown(kernelPlan(e, opts).run({ space: rows, origin: "0", vars }))];
}

/** This function checks that both tiers give the value `want`. */
const expectSame = (e: Expr, want: unknown, vars?: Readonly<Record<string, unknown>>, opts?: CompileOptions): void => {
  expect(both(e, vars, opts)).toEqual([want, want]);
};

/** This function gives the kind of the error of a result. */
const kindOf = (r: { readonly ok: boolean; readonly error?: { readonly kind: string } }): unknown => r.error?.kind;

/** This function checks the code of both tiers, and the message of each tier. */
const expectFails = (e: Expr, code: string, messages: readonly [string, string], vars?: Readonly<Record<string, unknown>>): void => {
  expect(both(e, vars)).toEqual([
    [code, messages[0]],
    [code, messages[1]],
  ]);
  // A #VALUE! of these ops has the kind kind-mismatch in both tiers.
  if (code !== "#VALUE!") return;
  const at = { space: rows, origin: "0", vars: vars ?? {} };
  expect([kindOf(evaluate(e, { ...OPTS, ...at })), kindOf(kernelPlan(e, OPTS).run(at))]).toEqual(["kind-mismatch", "kind-mismatch"]);
};

/** This function makes a list literal with a value or an error for each key. */
const listLit = (...pairs: readonly (readonly [string, unknown])[]): Expr => lit(vexList(pairs.map(([key, x]): ListItem => ({ key, result: x instanceof Error ? fail(vexError("missing-field", x.message)) : ok(x) }))));

describe("the list op distinct (LIST.DISTINCT)", () => {
  it("LIST.DISTINCT: keeps the first item of each value in the order of the list, with its key", () => {
    expectSame(app("distinct", ss), [
      ["0", "a"],
      ["1", "b"],
      ["4", "c"],
    ]);
    expectSame(app("distinct", v("xs")), [
      ["0", true],
      ["1", false],
    ], { xs: [true, false, true, false] });
    // === compares the values: a text and a number are not the same value, 0 and -0 are, and each NaN stays.
    expectSame(app("count", app("distinct", v("xs"))), 6, { xs: [1, "1", 0, -0, Number.NaN, Number.NaN, 1, 2] });
    expect(both(app("values", app("distinct", v("xs"))), { xs: [Number.NaN, 1, Number.NaN] })).toEqual([
      [Number.NaN, 1, Number.NaN],
      [Number.NaN, 1, Number.NaN],
    ]);
    expectSame(app("distinct", none), []);
    expectSame(app("distinct", ns), [
      ["0", 1],
      ["1", 2],
      ["2", 3],
      ["3", 4],
      ["4", 5],
      ["5", 6],
    ]);
  });

  it("LIST.DISTINCT LIST.LENIENT: skips the error items, strict gives the first, and a value that is not a number, a text or a boolean gives #VALUE!", () => {
    expectSame(app("keys", app("distinct", ss)), ["0", "1", "4"]);
    expectFails(app("distinct", ss, strict), "#N/A", ['the record at "3" has no value at "s"', "The path s reaches nothing."]);
    expectFails(app("distinct", v("xs")), "#VALUE!", ['"distinct" needs numbers, texts or booleans, but an item is a object', '"distinct" needs numbers, texts or booleans'], { xs: [1, { a: 1 }] });
    expectFails(app("distinct", v("xs")), "#VALUE!", ['"distinct" needs numbers, texts or booleans, but an item is a list', '"distinct" needs numbers, texts or booleans'], { xs: ["a", vexList([])] });
    expect(both(app("distinct", lit(deep))).map((r) => (r as readonly unknown[])[0])).toEqual(["#DEPTH!", "#DEPTH!"]);
  });
});

describe("the list op group (LIST.GROUP)", () => {
  const items = v("items");
  const vars = { items: ["x0", "x1", "x2", "x3"], keys: ["a", "b", "a", "c"] };

  it("LIST.GROUP: gives one item for each key, in the order of its first item, with the list of its items", () => {
    expectSame(
      app("group", items, v("keys")),
      [
        [
          "a",
          [
            ["0", "x0"],
            ["2", "x2"],
          ],
        ],
        ["b", [["1", "x1"]]],
        ["c", [["3", "x3"]]],
      ],
      vars,
    );
    // The value of each item is a list, so the list ops read it.
    expectSame(app("count", app("get", app("group", items, v("keys")), lit("a"))), 2, vars);
    expectSame(app("keys", app("group", ns, v("ks"))), ["b", "a"], { ks: ["b", "a", "b", "a", "a", "b"] });
    // The keys of an axis over the list: an item with an error gives an error key at its position.
    expectSame(
      app("group", ns, each(axes.list(ss), v("s"), undefined, ["s"])),
      [
        [
          "a",
          [
            ["0", 1],
            ["2", 3],
          ],
        ],
        [
          "b",
          [
            ["1", 2],
            ["5", 6],
          ],
        ],
        ["c", [["4", 5]]],
      ],
    );
    expectSame(app("group", none, none), []);
    expectSame(app("group", lit(vexList([])), lit([])), []);
  });

  it("LIST.GROUP: makes no function values, so a let binds the groups and a function reads them (FN.VALUE)", () => {
    const sizes = fn(["g"], app("values", each(axes.list(v("g")), app("count", v("x")), undefined, ["x"])));
    expectSame(let_({ sizes }, let_({ gs: app("group", items, v("keys")) }, call("sizes", v("gs")))), [2, 1, 1], vars);
  });

  it("LIST.GROUP LIST.LENIENT: skips a pair with an error item or an error key, and strict gives the first error of the list, then of the keys", () => {
    const list = listLit(["p", "x"], ["q", new Error("no q")], ["r", "z"], ["s", "w"]);
    const keys = listLit(["0", "a"], ["1", "a"], ["2", new Error("no key")], ["3", "a"]);
    expectSame(app("group", list, keys), [
      [
        "a",
        [
          ["p", "x"],
          ["s", "w"],
        ],
      ],
    ]);
    // A key that is not a text, at a pair with an error item, is skipped too.
    expectSame(app("keys", app("group", list, listLit(["0", "a"], ["1", 7], ["2", "b"], ["3", "b"]))), ["a", "b"]);
    expectFails(app("group", list, keys, strict), "#N/A", ["no q", "no q"]);
    expectFails(app("group", items, keys, strict), "#N/A", ["no key", "no key"], vars);
    expect(both(app("group", items, lit(vexList([...deep.items, ...deep.items, ...deep.items, ...deep.items]))), vars).map((r) => (r as readonly unknown[])[0])).toEqual(["#DEPTH!", "#DEPTH!"]);
    expect(both(app("group", lit(deep), lit(["a"]))).map((r) => (r as readonly unknown[])[0])).toEqual(["#DEPTH!", "#DEPTH!"]);
  });

  it("LIST.GROUP: another number of keys, keys that are not a list and a key that is not a text give #VALUE!", () => {
    expectFails(app("group", items, lit(["a", "b"])), "#VALUE!", ['"group" needs one key for each item, but the list has 4 items and 2 keys', '"group" needs one key for each item'], vars);
    expectFails(app("group", items, lit(["a", "b", "c", "d", "e"])), "#VALUE!", ['"group" needs one key for each item, but the list has 4 items and 5 keys', '"group" needs one key for each item'], vars);
    expectFails(app("group", items, lit("a")), "#VALUE!", ['"group" needs a list of keys as its second argument, not a string', '"group" needs a list of keys, not a string'], vars);
    expectFails(app("group", items), "#VALUE!", ['"group" needs a list of keys as its second argument, not a undefined', '"group" needs a list of keys, not a undefined'], vars);
    expectFails(app("group", items, lit(["a", "b", 3, "c"])), "#VALUE!", ['"group" needs text keys, but a key is a number', '"group" needs text keys'], vars);
    // A key of null in an array is an error key (LIST.ARRAY), so its pair is skipped.
    expectSame(app("keys", app("group", items, lit(["a", null, "b", "a"]))), ["a", "b"], vars);
  });
});

describe("the list op join (LIST.JOIN)", () => {
  it("LIST.JOIN: joins the texts of the items with the separator, and an empty list gives the empty text", () => {
    expectSame(app("join", ss, lit("|")), "a|b|a|c|b");
    expectSame(app("join", app("distinct", ss), lit(", ")), "a, b, c");
    expectSame(app("join", v("xs"), lit("")), "ab", { xs: ["a", "b"] });
    expectSame(app("join", v("xs"), lit("-")), "one", { xs: ["one"] });
    expectSame(app("join", none, lit("|")), "");
  });

  it("LIST.JOIN LIST.LENIENT: strict gives the first error item, and an item or a separator that is not a text gives #VALUE!", () => {
    expectFails(app("join", ss, lit("|"), strict), "#N/A", ['the record at "3" has no value at "s"', "The path s reaches nothing."]);
    expectFails(app("join", ns, lit("|")), "#VALUE!", ['"join" needs texts, but an item is a number', '"join" needs texts']);
    // An item that is not a text, after the texts, gives #VALUE! too.
    expect(both(app("join", v("xs"), lit("|")), { xs: ["a", true] }).map((r) => (r as readonly unknown[])[0])).toEqual(["#VALUE!", "#VALUE!"]);
    expectFails(app("join", ss, lit(1)), "#VALUE!", ['"join" needs a text separator, not a number', '"join" needs a text separator, not a number']);
    expectFails(app("join", ss), "#VALUE!", ['"join" needs a text separator, not a undefined', '"join" needs a text separator, not a undefined']);
    // The separator comes before the items.
    expectFails(app("join", ns, lit(null)), "#VALUE!", ['"join" needs a text separator, not a null', '"join" needs a text separator, not a null']);
  });
});

describe("the new list ops and the functions of the host (LIST.ARRAY)", () => {
  const host: CompileOptions = { domains: [Num], fns: { join: (): string => "host", distinct: (): string => "host", group: (): string => "host" } };

  it("LIST.DISTINCT LIST.GROUP LIST.JOIN: on a list of Vex, the list op comes before a function of the host with its name", () => {
    expectSame(app("join", ss, lit("|")), "a|b|a|c|b", {}, host);
    expectSame(app("keys", app("distinct", ss)), ["0", "1", "4"], {}, host);
    expectSame(app("keys", app("group", ns, v("ks"))), ["a"], { ks: ["a", "a", "a", "a", "a", "a"] }, host);
  });

  it("LIST.ARRAY: on an array, a function of the host or a domain with the name comes first", () => {
    expectSame(app("join", v("xs"), lit("|")), "host", { xs: ["a"] }, host);
    expectSame(app("distinct", v("xs")), "host", { xs: ["a"] }, host);
    expectSame(app("group", v("xs"), v("xs")), "host", { xs: ["a"] }, host);
    const Arrays = defineDomain({ name: "Arrays", is: (u: unknown): u is readonly unknown[] => Array.isArray(u), ops: { join: { fn: (): string => "domain" } } });
    expectSame(app("join", v("xs"), lit("|")), "domain", { xs: ["a"] }, { domains: [Num, Arrays] });
    // Without such an op, the list op reads the array.
    expectSame(app("join", v("xs"), lit("|")), "a|b", { xs: ["a", "b"] });
  });
});
