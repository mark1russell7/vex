/**
 * The faults of a module (COMPILE.MODULE.FAULT). The start of an exception tells a fault of the formula from a fault of
 * the printed code. A function of a domain gives an error of Vex, as in the interpreter. With the option `faults` at
 * `throw`, each other exception leaves the run.
 */
import { app, defineDomain, evaluate, let_, lit, ref, space, v, type Expr } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

interface Loaded {
  readonly run: (records: unknown, vars: unknown) => readonly unknown[];
  readonly VEX_ERROR: unknown;
}

const isNumber = (u: unknown): u is number => typeof u === "number";
const Probe = defineDomain({
  name: "Probe",
  is: isNumber,
  primitive: "number",
  ops: {
    boom: {
      fn: (x: number): number => {
        if (x > 1) throw new TypeError("the op refuses the value");
        return x + 1;
      },
      returns: "number",
    },
    // A body of one expression can go to the place of its call in the smaller form (COMPILE.MODULE.SIZE.INLINE).
    short: { fn: (x: number): number => (x > 1 ? x.toFixed(-1).length : x), returns: "number" },
    guarded: {
      fn: (x: number): number => {
        try {
          if (x > 1) throw new TypeError("the op catches this");
          return x;
        } catch {
          return -x;
        }
      },
      returns: "number",
    },
  },
});
const SCHEMA = { fields: { n: "number" } } as const;
const BASE: ModuleOptions = { domains: [Probe], schema: SCHEMA };
const THROWS: ModuleOptions = { ...BASE, faults: "throw" };
const RECORDS = [{ n: 0 }, { n: 2 }, { n: 1 }];
const BOOM = app("boom", ref("n"));

function sourceOf(e: Expr, options: ModuleOptions): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source with a broken statement at the start of the first `try` of the run. */
function broken(source: string, statement: string): string {
  const at = source.indexOf("function run(");
  const head = source.slice(0, at);
  const tail = source.slice(at);
  const out = tail.replace(/try \{\n/, `try {\n${statement}\n`);
  expect(out).not.toBe(tail);
  return head + out;
}

function interpreted(e: Expr, error: unknown): unknown[] {
  const s = space.array(RECORDS);
  return s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, domains: [Probe] });
    return r.ok ? r.value : error;
  });
}

describe("the faults of a module", () => {
  it("COMPILE.MODULE.FAULT: a name that reads itself throws its ReferenceError, and it does not become a value", () => {
    const source = broken(sourceOf(BOOM, THROWS), "const o = o;");
    expect(() => make(source).run(RECORDS, {})).toThrow(ReferenceError);
  });

  it("COMPILE.MODULE.FAULT: a TypeError of the printed code leaves the run", () => {
    const source = broken(sourceOf(BOOM, THROWS), "null.x;");
    expect(() => make(source).run(RECORDS, {})).toThrow(TypeError);
  });

  it("COMPILE.MODULE.FAULT: a TypeError of an op gives the value of the interpreter", () => {
    const m = make(sourceOf(BOOM, THROWS));
    const expected = interpreted(BOOM, m.VEX_ERROR);
    expect(expected).toStrictEqual([1, m.VEX_ERROR, 2]);
    expect(m.run(RECORDS, {})).toStrictEqual(expected);
    const held = app("ifError", BOOM, lit(-1));
    expect(make(sourceOf(held, THROWS)).run(RECORDS, {})).toStrictEqual(interpreted(held, m.VEX_ERROR));
  });

  it("COMPILE.MODULE.FAULT COMPILE.MODULE.SIZE.INLINE: an op with one call stays a declaration, so its exception is an error of Vex", () => {
    const e = let_({ x: ref("n") }, app("short", v("x")));
    const source = sourceOf(e, THROWS);
    expect(source).toContain("FW(");
    const m = make(source);
    expect(m.run(RECORDS, {})).toStrictEqual(interpreted(e, m.VEX_ERROR));
    expect(sourceOf(e, { ...BASE, faults: "value" })).not.toContain("op_");
  });

  it("COMPILE.MODULE.FAULT: the default of a module gives the error of Vex for each exception", () => {
    const m = make(sourceOf(BOOM, { ...BASE, faults: "value" }));
    expect(make(broken(sourceOf(BOOM, { ...BASE, faults: "value" }), "const o = o;")).run(RECORDS, {})).toStrictEqual(RECORDS.map(() => m.VEX_ERROR));
  });

  it("COMPILE.MODULE.FAULT: a catch inside the copy of an op keeps its text", () => {
    const e = app("guarded", ref("n"));
    const source = sourceOf(e, THROWS);
    expect(source).toMatch(/const op_\w+ = FW\([^]*?catch \{/);
    expect(make(source).run(RECORDS, {})).toStrictEqual(interpreted(e, undefined));
  });

  it("COMPILE.MODULE.FAULT: each form of a module takes the option", () => {
    const off = sourceOf(BOOM, { ...THROWS, fuse: false });
    expect(off).toContain("catch ($f) { FK($f);");
    const m = make(off);
    expect(m.run(RECORDS, {})).toStrictEqual(interpreted(BOOM, m.VEX_ERROR));
    expect(emitSheetModule(new Map([["y", BOOM]]), THROWS)).toMatchObject({ ok: true, source: expect.stringContaining("catch ($f) { FK($f);") as string });
  });
});
