/** The name of the run and the code of a module (COMPILE.MODULE.NAME, V-082). */
import { readdirSync, readFileSync } from "node:fs";
import { app, defineDomain, lit, ref, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { assert as check, constantFrom, integer, property, tuple } from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { LANGUAGE_GLOBALS } from "../test/names.ts";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";
import type * as Module from "./module.ts";

type Op = (x: number) => number;
type Run = (records: readonly unknown[], vars: Record<string, never>) => readonly unknown[];

const RECORDS = [{ n: 123 }];
const SCHEMA = { fields: { n: "number" } } as const;
const FAULTS = ["value", "throw"] as const;

/** This function gives a domain with ops. */
function shown(ops: Readonly<Record<string, Op>>): AnyDomain {
  const entries = Object.entries(ops).map(([name, fn]) => [name, { fn, params: ["number"], returns: "number" }]);
  return defineDomain({ name: "Show", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: Object.fromEntries(entries) as never }) as AnyDomain;
}

/** This function gives the options of a module with a domain. */
const optionsOf = (domain: AnyDomain, name: string, faults: "value" | "throw"): ModuleOptions => ({ domains: [NumDomain, BoolDomain, TextDomain, domain], schema: SCHEMA, name, faults });

/** This function gives the source of a module, and it throws on a reason. */
function print(e: Expr, options: ModuleOptions): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the run of a module. The scope of a function holds the same names as the scope of a module. */
function runOf(source: string, name: string): Run {
  const inner = /^export \{ (\S+) as \S+ \};$/m.exec(source)?.[1] ?? name;
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replace(/^export \{.*$/m, "").replaceAll(/^export /gm, "")}\nreturn ${inner};`)() as Run;
}

const width = (x: number): number => String(x).length;
const WIDTH = app("width", ref("n"));
// oxlint-disable-next-line no-shadow-restricted-names -- the test needs a parameter with the name of a global.
const next = (String: number): number => String + 1;
/** This function gives the length of a text with the word `String`. No code reads that word. */
const inText = (x: number): number => `String ${x.toFixed(0)}`.length;
/** This function gives a value through a property with the name `String`. */
const inProperty = (x: number): number => ({ String: x }).String;

/** This function gives an op that reads a global. It gives `1 + x` if the read gets the global, and `x` if a name hides it. */
function reader(name: string): Op {
  // oxlint-disable-next-line typescript/no-implied-eval -- the test makes the source of the op from the name.
  return new Function(`return (x) => (Object.is(${name}, globalThis[${JSON.stringify(name)}]) ? 1 : 0) + x;`)() as Op;
}

/** The globals that are good names. The module refuses `eval` and `arguments` as reserved words. */
const NAMES = [...LANGUAGE_GLOBALS].filter((x) => /^[A-Za-z_$][\w$]*$/.test(x) && !["eval", "arguments"].includes(x));

describe("COMPILE.MODULE.NAME: the name of the run hides nothing", () => {
  it.each(FAULTS)("V-082 COMPILE.MODULE.NAME: a run named String with the faults %s gives the value of the run named run", (faults) => {
    const domain = shown({ width });
    const named = print(WIDTH, optionsOf(domain, "String", faults));
    expect(named).toContain("function run$0(records, vars) {");
    expect(named).toContain("export { run$0 as String };");
    expect(runOf(named, "String")(RECORDS, {})).toStrictEqual([3]);
    expect(runOf(print(WIDTH, optionsOf(domain, "run", faults)), "run")(RECORDS, {})).toStrictEqual([3]);
  });

  it("V-082 COMPILE.MODULE.NAME: a name with a letter outside ASCII is a whole name of the code", () => {
    const source = print(app("step", ref("n")), optionsOf(shown({ step: (ñame: number): number => ñame + 1 }), "ñame", "value"));
    expect(source).toContain("export { run$0 as ñame };");
    expect(runOf(source, "ñame")(RECORDS, {})).toStrictEqual([124]);
  });

  it("V-082 COMPILE.MODULE.NAME: a default name that only the fixed note of a module holds stays the name of the function", () => {
    const source = print(WIDTH, optionsOf(shown({ width }), "run", "value"));
    expect(source).toContain("export function run(records, vars) {");
    expect(source).not.toContain("run$0");
  });

  it("V-082 COMPILE.MODULE.NAME: a run named Error leaves the class of the contract as an error", () => {
    // The line of the class is outside the code of the run, and it reads the global Error.
    const source = print(WIDTH, optionsOf(shown({ width }), "Error", "throw"));
    expect(source).toContain("export { run$0 as Error };");
    expect(runOf(source, "Error")(RECORDS, {})).toStrictEqual([3]);
    expect(() => runOf(source, "Error")(null as never, {})).toThrow(Error);
  });

  it("V-082 COMPILE.MODULE.NAME: a real import of the module gives the run under its name", async () => {
    const source = print(WIDTH, optionsOf(shown({ width }), "String", "throw"));
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    const imported = (await import(/* @vite-ignore */ url)) as { readonly String: Run };
    expect(imported.String(RECORDS, {})).toStrictEqual([3]);
  });

  it("COMPILE.MODULE.NAME: a name that no code has keeps the short form", () => {
    const source = print(WIDTH, optionsOf(shown({ width }), "TypeError", "value"));
    expect(source).toContain("export function TypeError(records, vars) {");
    expect(source).not.toContain("export {");
    expect(runOf(source, "TypeError")(RECORDS, {})).toStrictEqual([3]);
  });

  it("V-082 COMPILE.MODULE.NAME: two ops read the name", () => {
    const domain = shown({ width, twice: (x) => Number(String(x)) * 2 });
    const e = app("add", WIDTH, app("twice", ref("n")));
    expect(runOf(print(e, optionsOf(domain, "String", "throw")), "String")(RECORDS, {})).toStrictEqual([249]);
    expect(runOf(print(e, optionsOf(domain, "Number", "throw")), "Number")(RECORDS, {})).toStrictEqual([249]);
  });

  it("COMPILE.MODULE.NAME: a word in a text of an op is not a name of the code", () => {
    const source = print(app("inText", ref("n")), optionsOf(shown({ inText }), "String", "throw"));
    expect(source).toContain("export function String(records, vars) {");
    expect(runOf(source, "String")(RECORDS, {})).toStrictEqual([10]);
  });

  it("COMPILE.MODULE.NAME: a property of an op takes the safe form", () => {
    const source = print(app("inProperty", ref("n")), optionsOf(shown({ inProperty }), "String", "throw"));
    expect(source).toContain("export { run$0 as String };");
    expect(runOf(source, "String")(RECORDS, {})).toStrictEqual([123]);
  });

  it("COMPILE.MODULE.NAME: a name that starts a longer name of the code keeps the short form", () => {
    for (const name of ["Str", "Strin", "tring"]) {
      const source = print(WIDTH, optionsOf(shown({ width }), name, "throw"));
      expect(source).toContain(`export function ${name}(records, vars) {`);
      expect(runOf(source, name)(RECORDS, {})).toStrictEqual([3]);
    }
  });

  it("V-082 COMPILE.MODULE.NAME: the module of a sheet has each column under one run with the name", () => {
    const columns = new Map<string, Expr>([["a", WIDTH], ["b", app("add", WIDTH, lit(1))]]);
    const m = emitSheetModule(columns, { ...optionsOf(shown({ width }), "String", "throw"), kinds: { a: "number", b: "number" } });
    expect(m.ok ? m.source : m.reason).toContain("export { run$0 as String };");
  });

  it("COMPILE.MODULE.NAME: two modules in one program keep their own runs", async () => {
    const domain = shown({ width });
    const urls = ["String", "Number"].map((name) => `data:text/javascript;base64,${Buffer.from(print(WIDTH, optionsOf(domain, name, "throw"))).toString("base64")}`);
    const [one, two] = (await Promise.all(urls.map((url) => import(/* @vite-ignore */ url)))) as [{ readonly String: Run }, { readonly Number: Run }];
    expect(one.String(RECORDS, {})).toStrictEqual([3]);
    expect(two.Number(RECORDS, {})).toStrictEqual([3]);
  });

  it("COMPILE.MODULE.NAME: a parameter of an op with the name has its own value", () => {
    const e = app("next", ref("n"));
    expect(runOf(print(e, optionsOf(shown({ next }), "String", "throw")), "String")(RECORDS, {})).toStrictEqual([124]);
  });

  it("COMPILE.MODULE.NAME: the internal name is not a name of the code", async () => {
    // A free name of an op text with the internal name reads the host, so these prints do not go through the gate of the names.
    const { emitModule: actual } = await vi.importActual<typeof Module>("./module.ts");
    Reflect.set(globalThis, "run$0", 7);
    // oxlint-disable-next-line typescript/no-implied-eval -- the test makes an op that reads a global of the host.
    const read = new Function("return (x) => String(x).length + run$0;")() as Op;
    const m = actual(app("read", ref("n")), optionsOf(shown({ read }), "String", "throw"));
    expect(m.ok && m.source).toContain("export { run$1 as String };");
    expect(m.ok ? runOf(m.source, "String")(RECORDS, {}) : []).toStrictEqual([10]);
    Reflect.deleteProperty(globalThis, "run$0");
  });

  it("V-082 COMPILE.MODULE.NAME: no language global as the name of the run hides that global from an op", () => {
    const named = tuple(constantFrom(...NAMES), constantFrom(...FAULTS), integer({ min: -9, max: 9 }));
    check(
      property(named, ([name, faults, n]) => {
        const read = reader(name);
        const options = optionsOf(shown({ read }), name, faults);
        const source = print(app("read", ref("n")), options);
        expect(print(app("read", ref("n")), options)).toBe(source);
        expect(runOf(source, name)([{ n }], {})).toStrictEqual([n + 1]);
      }),
    );
  });

  it("V-082 COMPILE.MODULE.NAME: no declaration at the top of a golden file is a language global", () => {
    const golden = new URL("./__golden__/", import.meta.url);
    const files = readdirSync(golden).filter((f) => /^module-.*\.js$/.test(f));
    const declared = files.flatMap((f) => [...readFileSync(new URL(f, golden), "utf8").matchAll(/^(?:export )?(?:function|const|class) (\S+?)\b/gm)].map((x) => x[1]));
    expect(declared.length).toBeGreaterThan(100);
    expect(declared.filter((x) => LANGUAGE_GLOBALS.has(x))).toStrictEqual([]);
  });
});
