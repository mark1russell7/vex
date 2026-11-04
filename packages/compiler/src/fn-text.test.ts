import { describe, expect, it } from "vitest";
import { functionText } from "./fn-text.ts";

/** This function gives the function of a text. */
function make(text: string): (...a: never[]) => unknown {
  // oxlint-disable-next-line typescript/no-implied-eval -- each text is a constant of this test.
  return new Function(`return (${text});`)() as (...a: never[]) => unknown;
}

/** The forms of one function: each pair differs as the text of two runners differs. */
const SAME: readonly (readonly [string, string])[] = [
  ["(a,b,c)=>(a&&b)||c", "(a,b,c)=>a&&b||c"],
  ["(a      , b      )       => a + b", "(a,b)=>a+b"],
  ["(a) => (a === 1 ? 2 : 3)", "a=>a===1?2:3"],
  ["(from        , to        ) => ({ from, to })", "(from,to)=>({from,to})"],
  ["(a) => 'text'", 'a=>"text"'],
  ["(a) => 0.50", "a=>.5"],
  ["(a) => 0x10", "a=>16"],
  ["(a) => 1000", "a=>1e3"],
  ["(a) => { /* a note */ return a; }", "a=>{return a}"],
  ["(a) => {\n  const b = a\n  return b\n}", "a=>{const b=a;return b}"],
  ['(a) => { const f = (x) => x; return f(a); }', '(a)=>{const f=__name(x=>x,"f");return f(a)}'],
];

describe("the text of a function (COMPILE.MODULE.TEXT)", () => {
  it.each(SAME)("COMPILE.MODULE.TEXT: %s and %s give one text", (a, b) => {
    expect(functionText(make(a))).toBe(functionText(make(b)));
  });

  it("COMPILE.MODULE.TEXT: the parentheses that a value needs stay", () => {
    expect((make(functionText(make("(a,b,c)=>a*(b+c)"))) as unknown as (a: number, b: number, c: number) => number)(2, 3, 4)).toBe(14);
    expect(functionText(make("(a,b)=>({a,b})"))).toContain("({");
  });

  it("COMPILE.MODULE.TEXT: the text gives the values of each kind of literal", () => {
    const f = make(functionText(make("() => [1e999, 2n, /a b/g.source, true, null, `x${1 + 1}`, 'a\"b']"))) as unknown as () => unknown;
    expect(f()).toEqual([Number.POSITIVE_INFINITY, 2n, "a b", true, null, "x2", 'a"b']);
  });

  it("COMPILE.MODULE.TEXT: a call removes only the name of a function", () => {
    expect(functionText(make('(__name) => __name(1, "f")'))).toBe('__name => 1');
    expect(functionText(make("(__name) => __name(1)"))).toBe("__name => __name(1)");
    expect(functionText(make("(__name) => __name(1, 2)"))).toBe("__name => __name(1, 2)");
    expect(functionText(make("(__name) => __name(1, 'f', 3)"))).toBe('__name => __name(1, "f", 3)');
    expect(functionText(make("(g) => g(1, 'f')"))).toBe('g => g(1, "f")');
  });

  it("COMPILE.MODULE.TEXT: a text that is not one expression stays as it is", () => {
    const method = ({ m(a: never) { return a; } }).m;
    expect(functionText(method)).toBe(Function.prototype.toString.call(method));
    expect(functionText(Math.max)).toBe(Function.prototype.toString.call(Math.max));
  });
});
