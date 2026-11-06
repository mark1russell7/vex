import { compile, type Result } from "@mark1russell7/vex";
import { tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { treeInput as input, treeLong, treeWild } from "./inputs.ts";
import type { Band } from "./ireko-band.ts";
import { irekoRun, irekoSource } from "./ireko-modules.ts";
import { mergeBands } from "./ireko-shapes.ts";
import { PACK_MERGED, PACK_MOST, TREE_DOMAINS, TREE_PROGRAM, treeOutput, treeRun, type TreeChild, type TreeInput, type TreeOptions, type TreeOutput, type TreeValue } from "./ireko-tree.ts";

type TreeRun = ReturnType<typeof treeRun>;

/** The item at an index that exists by construction. */
function at<T>(list: ArrayLike<T>, i: number): T {
  const value = list[i];
  if (value === undefined) throw new RangeError(`No item at the index ${String(i)}.`);
  return value;
}

/** The copy of `depthOf` of ireko. */
function depthOf(c: TreeChild, side: TreeOptions["side"], self: TreeInput["self"], distance: number): number {
  const e = c.extent;
  switch (side) {
    case "bottom":
      return self.height + distance - Math.min(0, e.y);
    case "top":
      return -distance - Math.max(c.box.height, e.y + e.height);
    case "right":
      return self.width + distance - Math.min(0, e.x);
    case "left":
      return -distance - Math.max(c.box.width, e.x + e.width);
  }
}

/** The copy of `bandsOf` of ireko. */
function bandsOf(c: TreeChild, across: boolean): readonly Band[] {
  const e = c.extent;
  if (c.shape !== undefined) return across ? c.shape.rows : c.shape.columns;
  return across ? [{ from: e.y, to: e.y + e.height, min: e.x, max: e.x + e.width }] : [{ from: e.x, to: e.x + e.width, min: e.y, max: e.y + e.height }];
}

/** The copy of `pack` of ireko. */
function pack(bands: readonly (readonly Band[])[], gap: number): number[] {
  const places: number[] = [];
  let packed: Band[] = [];
  for (const [i, own] of bands.entries()) {
    let place = i === 0 ? 0 : at(places, i - 1);
    for (const b of own) {
      for (const p of packed) {
        if (p.from < b.to && b.from < p.to) place = Math.max(place, p.max - b.min + gap);
      }
    }
    places.push(place);
    const moved = place;
    packed = [...packed, ...own.map((b) => ({ ...b, min: b.min + moved, max: b.max + moved }))];
    if (packed.length > PACK_MOST) packed = mergeBands(packed, PACK_MERGED);
  }
  return places;
}

/** The copy of `flip` of ireko. */
const flip = (bands: readonly Band[]): Band[] => bands.map((b) => ({ ...b, min: -b.max, max: -b.min }));

/** The copy of the table `DIRECTION` of ireko. */
const DIRECTION = { bottom: "down", top: "up", left: "left", right: "right" } as const;

/** The copy of the function `tree.arrange` of ireko. */
function treeArrange({ mode, self, children, options, gap }: TreeInput): TreeOutput {
  const across = options.side === "bottom" || options.side === "top";
  const nested = mode === "nested";
  const distance = nested ? 0 : options.distance > 0 ? options.distance : 1.5 * gap;
  const depth = children.map((c) => depthOf(c, options.side, nested ? { width: 0, height: 0 } : self, distance));
  const bands = children.map((c, i) => bandsOf(c, across).map((b) => ({ ...b, from: b.from + at(depth, i), to: b.to + at(depth, i) })));

  const forward = pack(bands, gap);
  const backward = pack(bands.toReversed().map(flip), gap)
    .map((p) => -p)
    .toReversed();
  const shift = at(forward, 0) - at(backward, 0);
  let place = forward.map((f, i) => (f + at(backward, i) + shift) / 2);

  if (!nested) {
    const size = (c: TreeChild): number => (across ? c.box.width : c.box.height);
    const own = across ? self.width : self.height;
    const lastIndex = children.length - 1;
    const first = at(place, 0);
    const lastStart = at(place, lastIndex);
    const last = lastStart + size(at(children, lastIndex));
    const middle = (first + size(at(children, 0)) / 2 + lastStart + size(at(children, lastIndex)) / 2) / 2;
    const move = options.align === "start" ? -first : options.align === "end" ? own - last : own / 2 - middle;
    place = place.map((p) => p + move);
  }

  const offsets = children.map((_, i) => (across ? { x: at(place, i), y: at(depth, i) } : { x: at(depth, i), y: at(place, i) }));
  return nested ? { offsets } : { offsets, direction: DIRECTION[options.side] };
}

/** This function evaluates the program at each child with `run`, and it gives the output of the strategy. */
function arrangeWith(run: (r: { readonly space: TreeRun["space"]; readonly origin: string; readonly vars: TreeRun["vars"] }) => Result<unknown>, i: TreeInput): TreeOutput {
  const { space, vars } = treeRun(i);
  return treeOutput(
    space.keys.map((origin) => {
      const r = run({ space, origin, vars });
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      return r.value as TreeValue;
    }),
  );
}

/** This function gives the function of the standalone module of the program. */
function moduleOf(): (records: unknown, vars: unknown) => readonly TreeValue[] {
  return irekoRun("tree") as (records: unknown, vars: unknown) => readonly TreeValue[];
}

/** This function gives the output of the module for one input. */
function moduleRun(run: ReturnType<typeof moduleOf>, i: TreeInput): TreeOutput {
  const { space, vars } = treeRun(i);
  return treeOutput(run(space.records, vars));
}

/** This function tells if each offset of an output is finite. */
const finite = (o: TreeOutput): boolean => o.offsets.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

/** The outcome of a row that is not finite. */
const ERROR_AT_EACH = "an error at each child";

/** This function gives the outcome that the program must give for the output of ireko. */
const outcomeOf = (o: TreeOutput): TreeOutput | typeof ERROR_AT_EACH => (finite(o) ? o : ERROR_AT_EACH);

/** This function gives the outcome of the values of the module. An error at some of the children stays in the offsets. */
const moduleOutcome = (values: readonly TreeValue[]): TreeOutput | typeof ERROR_AT_EACH => (values.every((o) => o.x === undefined) ? ERROR_AT_EACH : treeOutput(values));

/** This function gives the outcome of the results of a tier, with the value of the module for an error. */
const tierOutcome = (results: readonly Result<unknown>[]): TreeOutput | typeof ERROR_AT_EACH => moduleOutcome(results.map((r) => (r.ok ? (r.value as TreeValue) : ({} as TreeValue))));

const LEAF: TreeChild = { box: { width: 120, height: 48 }, extent: { x: 0, y: 0, width: 120, height: 48 } };

/** This function makes a child with the box of a leaf and with rows of bands. */
const rowsOf = (rows: readonly Band[]): TreeChild => ({ ...LEAF, shape: { rows, columns: [] } });

/** The shape of a node with two children, on two rows and on three columns. */
const WIDE: TreeChild = {
  box: LEAF.box,
  extent: { x: -130, y: 0, width: 380, height: 116 },
  shape: {
    rows: [
      { from: 0, to: 48, min: 0, max: 120 },
      { from: 68, to: 116, min: -130, max: 250 },
    ],
    columns: [
      { from: -130, to: 0, min: 68, max: 116 },
      { from: 0, to: 120, min: 0, max: 116 },
      { from: 120, to: 250, min: 68, max: 116 },
    ],
  },
};
const DEFAULTS: TreeOptions = { side: "bottom", distance: 0, align: "center" };

/** This function makes an input with the box and the gap of the fixed cases. */
const inputOf = (mode: TreeInput["mode"], children: readonly TreeChild[], options: Partial<TreeOptions> = {}): TreeInput => ({
  mode,
  self: { width: 100, height: 50 },
  children,
  gap: 10,
  options: { ...DEFAULTS, ...options },
});

type Case = readonly [string, Partial<TreeOptions>, TreeInput["mode"], readonly TreeChild[], readonly (readonly [number, number])[], string?];

/** The fixed rows, with the offsets and the directions that the function `tree.arrange` of ireko gave for them. */
const IREKO_CASES: readonly Case[] = [
  ["three leaves", {}, "nested", [LEAF, LEAF, LEAF], [[0, 0], [130, 0], [260, 0]]],
  ["a leaf between two wide subtrees", {}, "nested", [WIDE, LEAF, WIDE], [[0, 0], [195, 0], [390, 0]]],
  ["two wide subtrees", {}, "nested", [WIDE, WIDE], [[0, 0], [390, 0]]],
  ["top", { side: "top" }, "nested", [WIDE, LEAF, WIDE], [[0, -116], [260, -48], [520, -116]]],
  ["right", { side: "right" }, "nested", [WIDE, LEAF, WIDE], [[130, 0], [0, 126], [130, 126]]],
  ["left", { side: "left" }, "nested", [WIDE, LEAF, WIDE], [[-250, 0], [-120, 126], [-250, 126]]],
  ["linked", {}, "linked", [WIDE, LEAF, WIDE], [[-205, 65], [-10, 65], [185, 65]], "down"],
  ["linked with a distance", { distance: 40 }, "linked", [LEAF, LEAF], [[-75, 90], [55, 90]], "down"],
  ["linked start", { align: "start" }, "linked", [WIDE, LEAF, WIDE], [[0, 65], [195, 65], [390, 65]], "down"],
  ["linked end", { align: "end" }, "linked", [WIDE, LEAF, WIDE], [[-410, 65], [-215, 65], [-20, 65]], "down"],
  ["linked top", { side: "top" }, "linked", [LEAF, WIDE], [[-140, -63], [120, -131]], "up"],
  ["linked right", { side: "right" }, "linked", [LEAF, WIDE], [[115, 1], [245, 1]], "right"],
  ["linked left", { side: "left" }, "linked", [WIDE, LEAF], [[-265, -62], [-135, 64]], "left"],
  ["one child", {}, "linked", [LEAF], [[-10, 65]], "down"],
];

/** This function gives the output of a fixed case. */
function outputOf(offsets: Case[4], direction: string | undefined): TreeOutput {
  const list = offsets.map(([x, y]) => ({ x, y }));
  return direction === undefined ? { offsets: list } : { offsets: list, direction };
}

/**
 * This function gives `n` bands apart from each other. Each two bands have a `max` of 0, and the next two have a `max`
 * of 100. A merge of each pair keeps the first `max` of 0, and a second merge makes it 100.
 */
const stairs = (n: number): Band[] => Array.from({ length: n }, (_, j) => ({ from: 2 * j, to: 2 * j + 1, min: 0, max: j % 4 < 2 ? 0 : 100 }));

/** A child with one band between the first two bands of the stairs. Only a merge makes a band that overlaps it. */
const LOW = rowsOf([{ from: 1.25, to: 1.75, min: 0, max: 10 }]);
/** The stairs at the limit of the merge: a row with these bands does not merge. */
const AT_LIMIT = stairs(PACK_MOST);
/** The stairs past the limit. The last band repeats an interval, so the sweep gives 256 bands, and one merge gives 128 bands. */
const PAST_LIMIT = [...AT_LIMIT, ...AT_LIMIT.slice(-1)];

/** A subtree of one row, with a band of a width that overflows a sum. */
const HUGE = rowsOf([{ from: 0, to: 48, min: -1e308, max: 1e308 }]);
/** A subtree with a band at `Infinity`, so the clearance of a band that overlaps it is `-Infinity`. */
const FAR = rowsOf([{ from: 0, to: 48, min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY }]);

describe("the ireko tree pilot", () => {
  const interpreted = compile(TREE_PROGRAM, { domains: TREE_DOMAINS });
  const generated = tiered(TREE_PROGRAM, { domains: TREE_DOMAINS });
  const tree = moduleOf();

  it("COMPILE.MODULE: the module gives the layout of ireko with the same bits", () => {
    fc.assert(
      fc.property(input(10, 6), (i) => {
        expect(moduleRun(tree, i)).toEqual(treeArrange(i));
      }),
    );
  });

  it("COMPILE.TIERED: the program gives the layout of ireko in the interpreter and in tier 2", () => {
    fc.assert(
      fc.property(input(4, 3), (i) => {
        const expected = treeArrange(i);
        expect(arrangeWith((r) => interpreted.run(r), i)).toEqual(expected);
        expect(arrangeWith((r) => generated.run(r), i)).toEqual(expected);
      }),
      { numRuns: 20 },
    );
    // A run of a child with a shape goes to tier 1, because the fields of the bands are arrays (V-064).
    expect(generated.tier).toBe(2);
  });

  it("gives the offsets of the function of ireko on fixed rows, at each side and in each mode", () => {
    for (const [name, options, mode, children, offsets, direction] of IREKO_CASES) {
      const i = inputOf(mode, children, options);
      const expected = { name, output: outputOf(offsets, direction) };
      expect({ name, output: treeArrange(i) }).toEqual(expected);
      expect({ name, output: moduleRun(tree, i) }).toEqual(expected);
      expect({ name, output: arrangeWith((r) => interpreted.run(r), i) }).toEqual(expected);
      expect({ name, output: arrangeWith((r) => generated.run(r), i) }).toEqual(expected);
    }
  });

  it("COMPILE.MODULE.APPEND.LET COMPILE.MODULE.APPEND.READ: each print of the function pack appends the moved bands into the packed list of its loop", () => {
    // The step of the place reads the packed list first. The step of the packed list binds the append to a new name.
    // Thus the append pushes into the array of the loop, and no append copies the packed list.
    const source = irekoSource("tree", "value");
    expect(source.match(/\(w\d+ = AO\(l\d+, L\d+, false, w\d+\)\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/\bAP\(l\d+/);
  });

  it("COMPILE.MODULE: the merge of a long row gives the layout of ireko with the same bits", () => {
    fc.assert(
      fc.property(treeLong, (i) => {
        expect(moduleRun(tree, i)).toEqual(treeArrange(i));
      }),
      { numRuns: 20, endOnFailure: true },
    );
  });

  it("merges the bands of a row only past the limit of ireko, and to its number of bands, in each tier", () => {
    const expected = new Map([
      // The pack from the last child does not merge, so the mean is the half of the forward place: 0, 10 or 110.
      [AT_LIMIT, [0, 0]],
      [PAST_LIMIT, [0, 5]],
    ]);
    for (const [bands, places] of expected) {
      const i = inputOf("nested", [rowsOf(bands), LOW]);
      expect(treeArrange(i).offsets.map((o) => o.x)).toEqual(places);
      expect(moduleRun(tree, i).offsets.map((o) => o.x)).toEqual(places);
      expect(arrangeWith((r) => interpreted.run(r), i).offsets.map((o) => o.x)).toEqual(places);
      expect(arrangeWith((r) => generated.run(r), i).offsets.map((o) => o.x)).toEqual(places);
    }
  });

  it("keeps the place where a clearance is -Infinity, as Math.max does in ireko", () => {
    const i = inputOf("nested", [LEAF, FAR]);
    const expected = { offsets: [{ x: 0, y: 0 }, { x: 0, y: 0 }] };
    expect(treeArrange(i)).toEqual(expected);
    expect(moduleRun(tree, i)).toEqual(expected);
    expect(arrangeWith((r) => interpreted.run(r), i)).toEqual(expected);
    expect(arrangeWith((r) => generated.run(r), i)).toEqual(expected);
  });

  it("COMPILE.MODULE: infinite numbers give the bits of ireko or an error at each child", () => {
    fc.assert(
      fc.property(treeWild, (i) => {
        const expected = treeArrange(i);
        const { space, vars } = treeRun(i);
        expect(moduleOutcome(tree(space.records, vars))).toEqual(outcomeOf(expected));
      }),
    );
  });

  it("COMPILE.TIERED: infinite numbers give the bits of ireko or an error at each child", () => {
    fc.assert(
      fc.property(treeWild, (i) => {
        const expected = outcomeOf(treeArrange(i));
        const { space, vars } = treeRun(i);
        expect(tierOutcome(space.keys.map((origin) => interpreted.run({ space, origin, vars })))).toEqual(expected);
        expect(tierOutcome(space.keys.map((origin) => generated.run({ space, origin, vars })))).toEqual(expected);
      }),
      { numRuns: 20 },
    );
  });

  it("gives an error at each child for an offset that is not finite, also where ireko keeps a finite offset", () => {
    const tall: TreeChild = { ...LEAF, extent: { ...LEAF.extent, height: Number.POSITIVE_INFINITY } };
    const partly = inputOf("nested", [LEAF, tall], { side: "top" });
    const overflow = inputOf("nested", [HUGE, HUGE]);
    // This difference is the first rare case of the header of the pilot.
    expect(treeArrange(partly).offsets.some((o) => Number.isFinite(o.y))).toBe(true);
    expect(finite(treeArrange(partly))).toBe(false);
    expect(finite(treeArrange(overflow))).toBe(false);
    for (const i of [partly, overflow]) {
      const { space, vars } = treeRun(i);
      expect(space.keys.every((origin) => !interpreted.run({ space, origin, vars }).ok)).toBe(true);
      expect(tree(space.records, vars).every((o) => o.x === undefined)).toBe(true);
    }
  });

  it("gives an error at each child for a band with NaN, also where ireko ignores the band", () => {
    const hollow = rowsOf([{ from: 500, to: 600, min: Number.NaN, max: 0 }]);
    const noShape: TreeChild = { ...LEAF, extent: { ...LEAF.extent, x: Number.NaN } };
    const ignored = inputOf("nested", [LEAF, hollow]);
    const seen = inputOf("nested", [noShape, LEAF, WIDE]);
    // This difference is the second rare case of the header of the pilot. The band overlaps no band of the other child.
    expect(finite(treeArrange(ignored))).toBe(true);
    // A child with no shape makes its band from the extent. The other children keep their positions in the row.
    expect(finite(treeArrange(seen))).toBe(false);
    for (const i of [ignored, seen]) {
      const { space, vars } = treeRun(i);
      expect(space.keys.every((origin) => !interpreted.run({ space, origin, vars }).ok)).toBe(true);
      expect(tree(space.records, vars).every((o) => o.x === undefined)).toBe(true);
    }
  });

  it("gives no offsets for no children, where ireko throws", () => {
    const none = inputOf("nested", []);
    // This difference is the third rare case of the header of the pilot.
    expect(() => treeArrange(none)).toThrow(RangeError);
    expect(moduleRun(tree, none)).toEqual({ offsets: [] });
  });
});
