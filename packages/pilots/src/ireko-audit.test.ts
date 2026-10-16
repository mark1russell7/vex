import { compile, type Result } from "@mark1russell7/vex";
import { emitModule, tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ESCAPE_DOMAINS, ESCAPE_PROGRAM, ESCAPE_SCHEMA, escapeRun, escapes, type PlacedBox } from "./ireko-audit.ts";

/**
 * Random placed trees. The container of a node is an earlier node or -1, as in the pre-order of ireko. A node is near
 * its container, so some nodes are inside, some are outside, and some are at the tolerance.
 */
const tree: fc.Arbitrary<PlacedBox[]> = fc
  .array(
    fc.record({
      parent: fc.nat(),
      orphan: fc.boolean(),
      dx: fc.oneof(fc.constantFrom(-0.5, -0.25, 0, 0.5), fc.double({ min: -20, max: 60, noNaN: true, noDefaultInfinity: true })),
      dy: fc.oneof(fc.constantFrom(-0.5, 0, 0.5), fc.double({ min: -20, max: 60, noNaN: true, noDefaultInfinity: true })),
      width: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      height: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      clip: fc.boolean(),
    }),
    { minLength: 1, maxLength: 24 },
  )
  .map((rows) => {
    const out: PlacedBox[] = [];
    rows.forEach((r, i) => {
      const container = i === 0 || r.orphan ? -1 : r.parent % i;
      const c = out[container];
      out.push({ x: (c?.x ?? 0) + r.dx, y: (c?.y ?? 0) + r.dy, width: r.width, height: r.height, container, clip: r.clip });
    });
    return out;
  });

/** This function evaluates the program at each node with `run`. */
function valuesOf(run: (r: { readonly space: ReturnType<typeof escapeRun>["space"]; readonly origin: string }) => Result<unknown>, nodes: readonly PlacedBox[]): unknown[] {
  const { space } = escapeRun(nodes);
  return space.keys.map((origin) => {
    const r = run({ space, origin });
    if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
    return r.value;
  });
}

describe("the ireko audit pilot", () => {
  const interpreted = compile(ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS });
  const generated = tiered(ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS });
  const m = emitModule(ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS, schema: ESCAPE_SCHEMA, name: "escapes" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  const module = new Function(`${m.source.replaceAll(/^export /gm, "")}
return escapes;`)() as (records: unknown, vars: unknown) => readonly boolean[];

  it("COMPILE.MODULE: the program gives the findings ESCAPE of ireko in the interpreter, in tier 2 and in the module", () => {
    expect(m.source).not.toContain("import");
    fc.assert(
      fc.property(tree, (nodes) => {
        const expected = escapes(nodes);
        expect(valuesOf((r) => interpreted.run(r), nodes)).toEqual(expected);
        expect(valuesOf((r) => generated.run(r), nodes)).toEqual(expected);
        expect(module(escapeRun(nodes).space.records, {})).toEqual(expected);
      }),
    );
    expect(generated.tier).toBe(2);
    expect(generated.stats.fallbacks).toBe(0);
  });

  it("gives the findings of fixed cases: inside, at the tolerance, outside, and outside a container that clips", () => {
    const root: PlacedBox = { x: 0, y: 0, width: 100, height: 50, container: -1, clip: false };
    const nodes: PlacedBox[] = [
      root,
      { x: -0.5, y: 0, width: 100.5, height: 50.5, container: 0, clip: false },
      { x: 90, y: 10, width: 11, height: 10, container: 0, clip: true },
      { x: 95, y: 10, width: 20, height: 10, container: 2, clip: false },
    ];
    expect(escapes(nodes)).toEqual([false, false, true, false]);
    expect(module(escapeRun(nodes).space.records, {})).toEqual([false, false, true, false]);
    expect(() => escapes([{ ...root, container: 3 }])).toThrow("The container 3 does not exist.");
  });
});
