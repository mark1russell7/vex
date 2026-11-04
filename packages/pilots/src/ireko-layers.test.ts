import { compile, type Result } from "@mark1russell7/vex";
import { emitModule, tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { layersEdges as edgeList, layersInput as input } from "./inputs.ts";
import type { Extent } from "./ireko-grid.ts";
import { LAYERS_DOMAINS, LAYERS_PROGRAM, LAYERS_SCHEMA, layersArrange, layersOf, layersRun, orderOf, type LayersEdge, type LayersInput, type LayersOptions, type LayersOutput } from "./ireko-layers.ts";

type Offset = { readonly x: number; readonly y: number };
type LayersRun = ReturnType<typeof layersRun>;

/** This function evaluates the program at each child with `run`, and it gives the output of the strategy. */
function arrangeWith(run: (r: { readonly space: LayersRun["space"]; readonly origin: string; readonly vars: LayersRun["vars"] }) => Result<unknown>, i: LayersInput): LayersOutput {
  const { space, vars } = layersRun(i);
  return {
    offsets: space.keys.map((origin) => {
      const r = run({ space, origin, vars });
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      return r.value as Offset;
    }),
  };
}

/** This function gives the function of the standalone module of the program. */
function moduleOf(): (records: unknown, vars: unknown) => readonly Offset[] {
  const m = emitModule(LAYERS_PROGRAM, { domains: LAYERS_DOMAINS, schema: LAYERS_SCHEMA, name: "layers", lists: "plain" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return layers;`)() as (records: unknown, vars: unknown) => readonly Offset[];
}

/** This function gives the output of the module for one input. */
function moduleRun(run: ReturnType<typeof moduleOf>, i: LayersInput): LayersOutput {
  const { space, vars } = layersRun(i);
  return { offsets: run(space.records, vars).map((o) => ({ x: o.x, y: o.y })) };
}

const LEAF: Extent = { x: 0, y: 0, width: 120, height: 48 };
/** This function gives an extent with a width and no height. */
const flat = (width: number): Extent => ({ x: 0, y: 0, width, height: 0 });
const DEFAULTS: LayersOptions = { side: "bottom", distance: 0, align: "center" };
const FAN: readonly LayersEdge[] = [{ from: 0, to: 1 }, { from: 0, to: 2 }];
const DIAMOND: readonly LayersEdge[] = [...FAN, { from: 1, to: 3 }, { from: 2, to: 3 }];
/** The diamond with two more edges. The last edge closes a cycle. */
const CHART: readonly LayersEdge[] = [...DIAMOND, { from: 3, to: 4 }, { from: 4, to: 0 }];
/** A cycle, a loop on one child and an end outside the children. */
const NOISY: readonly LayersEdge[] = [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 0 }, { from: 1, to: 1 }, { from: 7, to: 0 }];

type Case = readonly [string, Partial<LayersOptions>, LayersInput["mode"], readonly LayersEdge[], number, readonly Offset[]];

/** The fixed graphs, with the offsets that the function `layers.arrange` of ireko gave for them. */
const IREKO_CASES: readonly Case[] = [
  ["diamond", {}, "nested", DIAMOND, 4, [{ x: 65, y: 0 }, { x: 0, y: 68 }, { x: 130, y: 68 }, { x: 65, y: 136 }]],
  ["two edges that cross", {}, "nested", [{ from: 0, to: 3 }, { from: 1, to: 2 }], 4, [{ x: 0, y: 0 }, { x: 130, y: 0 }, { x: 130, y: 68 }, { x: 0, y: 68 }]],
  ["a cycle, a loop and an end outside", {}, "nested", NOISY, 3, [{ x: 0, y: 0 }, { x: 0, y: 68 }, { x: 0, y: 136 }]],
  ["top", { side: "top" }, "nested", FAN, 3, [{ x: 65, y: 68 }, { x: 0, y: 0 }, { x: 130, y: 0 }]],
  ["right", { side: "right" }, "nested", FAN, 3, [{ x: 0, y: 29 }, { x: 140, y: 0 }, { x: 140, y: 58 }]],
  ["left", { side: "left" }, "nested", FAN, 3, [{ x: 140, y: 29 }, { x: 0, y: 0 }, { x: 0, y: 58 }]],
  ["start", { align: "start" }, "nested", FAN, 3, [{ x: 0, y: 0 }, { x: 0, y: 68 }, { x: 130, y: 68 }]],
  ["end", { align: "end" }, "nested", FAN, 3, [{ x: 130, y: 0 }, { x: 0, y: 68 }, { x: 130, y: 68 }]],
  ["linked", {}, "linked", FAN, 3, [{ x: -10, y: 70 }, { x: -75, y: 138 }, { x: 55, y: 138 }]],
  ["linked top", { side: "top" }, "linked", FAN, 3, [{ x: -10, y: -68 }, { x: -75, y: -136 }, { x: 55, y: -136 }]],
  ["linked right", { side: "right" }, "linked", FAN, 3, [{ x: 120, y: 1 }, { x: 260, y: -28 }, { x: 260, y: 30 }]],
  ["linked left", { side: "left" }, "linked", FAN, 3, [{ x: -140, y: 1 }, { x: -280, y: -28 }, { x: -280, y: 30 }]],
  ["flowchart", {}, "nested", CHART, 5, [{ x: 65, y: 0 }, { x: 0, y: 68 }, { x: 130, y: 68 }, { x: 65, y: 136 }, { x: 65, y: 204 }]],
];

describe("the ireko layers pilot", () => {
  const interpreted = compile(LAYERS_PROGRAM, { domains: LAYERS_DOMAINS });
  const generated = tiered(LAYERS_PROGRAM, { domains: LAYERS_DOMAINS });
  const layers = moduleOf();

  it("COMPILE.MODULE: the module gives the layout of ireko with the same bits", () => {
    fc.assert(
      fc.property(input(14), (i) => {
        expect(moduleRun(layers, i)).toEqual(layersArrange(i));
      }),
    );
  });

  it("COMPILE.TIERED: the program gives the layout of ireko in the interpreter and in tier 2", () => {
    // The interpreter searches the graph again at each child, so these runs have few children.
    fc.assert(
      fc.property(input(5), (i) => {
        const expected = layersArrange(i);
        expect(arrangeWith((r) => interpreted.run(r), i)).toEqual(expected);
        expect(arrangeWith((r) => generated.run(r), i)).toEqual(expected);
      }),
      { numRuns: 20 },
    );
    // A run with an edge goes to tier 1, because the fields of the edges are arrays (V-064).
    expect(generated.tier).toBe(2);
  });

  it("gives the offsets of the function of ireko on fixed graphs, at each side and in each mode", () => {
    for (const [name, options, mode, list, count, expected] of IREKO_CASES) {
      const i: LayersInput = { mode, self: { width: 100, height: 50 }, extents: Array.from({ length: count }, () => LEAF), gap: 10, options: { ...DEFAULTS, ...options }, edges: list };
      expect({ name, offsets: layersArrange(i).offsets }).toEqual({ name, offsets: expected });
      expect({ name, offsets: moduleRun(layers, i).offsets }).toEqual({ name, offsets: expected });
      expect({ name, offsets: arrangeWith((r) => interpreted.run(r), i).offsets }).toEqual({ name, offsets: expected });
    }
  });

  it("adds in the order of ireko: a sum of the flow in another order changes the last bit", () => {
    const i: LayersInput = {
      mode: "nested",
      self: { width: 0, height: 0 },
      extents: [flat(174.90090279050656), flat(0), flat(5.126994851237244e-9)],
      gap: 0.007812499963498077,
      options: { ...DEFAULTS, side: "left" },
      edges: [{ from: 0, to: 2 }, { from: 2, to: 1 }],
    };
    const expected = [{ x: 0.03125000498096142, y: 0 }, { x: -2.842170943040401e-14, y: 0 }, { x: 0.015624999926981941, y: 0 }];
    expect(layersArrange(i).offsets).toEqual(expected);
    expect(moduleRun(layers, i).offsets).toEqual(expected);
    expect(arrangeWith((r) => generated.run(r), i).offsets).toEqual(expected);
  });

  it("gives the layers and the order of a flowchart with a cycle: the last edge turns around", () => {
    const layer = layersOf(5, CHART);
    expect(layer).toEqual([0, 1, 1, 2, 3]);
    expect(orderOf(5, layer, CHART)).toEqual([[0], [1, 2], [3], [4]]);
  });

  it("COMPILE.MODULE: the module gives the layout of ireko on a graph of 200 children", () => {
    const large = fc.integer({ min: 180, max: 200 }).chain((k) => fc.tuple(fc.constant(k), edgeList(k)));
    // A failure stops without a shrink, because each run has more than 1000 steps of the search.
    fc.assert(
      fc.property(large, ([k, list]) => {
        const i: LayersInput = { mode: "nested", self: { width: 0, height: 0 }, extents: Array.from({ length: k }, () => LEAF), gap: 10, options: DEFAULTS, edges: list };
        expect(moduleRun(layers, i)).toEqual(layersArrange(i));
      }),
      { numRuns: 3, endOnFailure: true },
    );
  });

  it("gives an error at each child for a sum that is not finite, also where ireko keeps a finite offset", () => {
    const wide: Extent = { ...LEAF, width: 1e308 };
    const start: LayersInput = { mode: "nested", self: { width: 0, height: 0 }, extents: [wide, wide], gap: 10, options: { ...DEFAULTS, align: "start" }, edges: [] };
    const center: LayersInput = { ...start, options: DEFAULTS };
    // This difference is the first rare case of the header of the pilot.
    expect(layersArrange(start).offsets.every((o) => Number.isFinite(o.x))).toBe(true);
    expect(layersArrange(center).offsets.every((o) => Number.isFinite(o.x))).toBe(false);
    for (const i of [start, center]) {
      const { space, vars } = layersRun(i);
      expect(space.keys.every((origin) => !interpreted.run({ space, origin, vars }).ok)).toBe(true);
      expect(moduleRun(layers, i).offsets.every((o) => o.x === undefined)).toBe(true);
    }
  });
});
