// The tests of the edit of the walk bench (LIMITCOST). The edit must apply to the module of today's emitter, and the
// variant must give the result of the module.
import { evaluate, space } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { emitModule } from "../src/index.ts";
import { countAtEachKey, loadWalk, WALK_OPTIONS, WALK_PROGRAM, walkRecords } from "./limit-walk.ts";

const source = (): string => {
  const m = emitModule(WALK_PROGRAM, WALK_OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
};
const same = (x: string): string => x;

describe("the walk bench of a data limit", () => {
  it("has one count before the loop over the keys, and the edit moves it into that loop", () => {
    const text = source();
    expect(text).toContain("= L(() => {");
    const edited = countAtEachKey(text);
    expect(edited).not.toContain("= L(() => {");
    expect(/for \(let o = 0;[\s\S]*for \(let q\d+ = 0;/.test(edited)).toBe(true);
    expect(/for \(let q\d+ = 0;[\s\S]*for \(let o = 0;/.test(edited)).toBe(false);
  });

  it("gives the values of the interpreter, with the edit and without it, on a tree of 111 nodes", () => {
    const records = walkRecords(10, 2);
    expect(records).toHaveLength(111);
    const s = space.array(records);
    const want = s.keys.map((origin) => {
      const r = evaluate(WALK_PROGRAM, { space: s, origin, vars: {}, domains: WALK_OPTIONS.domains });
      return r.ok ? r.value : undefined;
    });
    expect(want.every((x) => x !== undefined)).toBe(true);
    expect(loadWalk(same)(records, {})).toEqual(want);
    expect(loadWalk(countAtEachKey)(records, {})).toEqual(want);
  });

  it("stops when the module has no lazy count, or no read of it", () => {
    expect(() => countAtEachKey("const x = 1;")).toThrow(/one lazy count/);
    expect(() => countAtEachKey("  const c1 = L(() => {\n    let y = 0;\n    return y;\n  });\n")).toThrow(/no read/);
  });
});
