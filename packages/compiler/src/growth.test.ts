/**
 * The rule of the gate of the growth of a compile (COMPILE.GROWTH). The gate `bench/growth.ts` runs in the speed gate, and
 * this file tests its rule and the sizes of its shapes.
 */
import { MAX_NESTING, nestingOf } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it, vi } from "vitest";
import { BYTES_LIMIT, bytesFlipReadsRed, bytesUnread, exponent, exponentsOf, GENERATE_FLOOR_MS, GROWTH_SHAPES, growthFaults, LOAD_FLOOR_MS, loadExponentOf, SOURCE_TIME_LIMIT, sourceVerdict, TIME_LIMIT, type GrowthRow, type GrowthShape } from "../test/growth.ts";
import type * as Module from "./module.ts";
import { emitModule } from "./module.ts";
import { MAX_PLACES, placesOf } from "./unshared.ts";

const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;
const SHAPE: GrowthShape = { name: "s", make: () => ({ tag: "lit", value: 0 }), small: 1, large: 2, source: { bytes: 1.04 } };
const row = (places: number, ms: number | undefined, bytes: number | undefined): GrowthRow => ({ shape: "s", levels: places, places, ms, bytes });
/** A row of the source: `ms` is the time of `generate`, and `loadMs` is the time of `load`. */
const sourceRow = (places: number, ms: number, loadMs: number, bytes: number): GrowthRow => ({ ...row(places, ms, bytes), loadMs });
const HELD: GrowthShape = { ...SHAPE, source: { bytes: 1.04, generate: 1.1, why: "a reason" } };
const LOAD_HELD: GrowthShape = { ...SHAPE, source: { bytes: 1.04, load: 1.1, loadSmallMs: 120, why: "a reason" } };

describe("COMPILE.GROWTH", () => {
  it.each(GROWTH_SHAPES.map((s) => [s.name, s] as const))("COMPILE.GROWTH: the sizes of %s are legal, and they print", async (_name, shape) => {
    const large = JSON.parse(JSON.stringify(shape.make(shape.large))) as ReturnType<GrowthShape["make"]>;
    const small = shape.make(shape.small);
    expect(nestingOf(large)).toBeLessThanOrEqual(MAX_NESTING);
    expect(placesOf([large])).toBeLessThanOrEqual(MAX_PLACES);
    // The gates of the test setup read the small size. The bench reads the names of the large size, and the gate of the keys does not read it.
    const printer = await vi.importActual<typeof Module>("./module.ts");
    expect(printer.emitModule(large, OPTIONS).ok).toBe(true);
    expect(emitModule(small, OPTIONS).ok).toBe(true);
    expect(placesOf([small])).toBeLessThan(placesOf([large]));
  });

  it("COMPILE.GROWTH: a shape with a limit of its own states the reason", () => {
    expect(GROWTH_SHAPES.filter((s) => (s.time !== undefined || s.bytes !== undefined) && s.why === undefined)).toStrictEqual([]);
  });

  it("COMPILE.GROWTH: the exponent is 1 for a linear growth and 2 for a quadratic growth", () => {
    expect(exponent(10, 40, 100, 400)).toBeCloseTo(1);
    expect(exponent(10, 160, 100, 400)).toBeCloseTo(2);
  });

  it("COMPILE.GROWTH: a linear shape has no fault, and a quadratic shape fails on its time and on its bytes", () => {
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 40, 4000))).toStrictEqual([]);
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 160, 4000))).toStrictEqual([`s has a time exponent of 2.00, and the limit is ${String(TIME_LIMIT)}`]);
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 40, 16_000))).toStrictEqual([`s has a bytes exponent of 2.00, and the limit is ${String(BYTES_LIMIT)}`]);
  });

  it("COMPILE.GROWTH: a limit of a shape replaces the limit of the gate, and a value at the limit passes", () => {
    const own: GrowthShape = { ...SHAPE, time: 2, bytes: 2, why: "a reason" };
    expect(growthFaults(own, row(100, 10, 1000), row(400, 160, 16_000))).toStrictEqual([]);
    expect(growthFaults(own, row(100, 10, 1000), row(400, 170, 16_000))).toStrictEqual(["s has a time exponent of 2.04, and the limit is 2"]);
  });

  it("COMPILE.GROWTH: a size with no result is a fault", () => {
    expect(growthFaults(SHAPE, row(100, undefined, 1000), row(400, 40, 4000))).toStrictEqual(["s has a size with no result"]);
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 40, undefined))).toStrictEqual(["s has a size with no result"]);
    expect(exponentsOf(row(100, 10, undefined), row(400, 40, 4000))).toBeUndefined();
  });
});

describe("COMPILE.SOURCE.SIZE", () => {
  it("COMPILE.SOURCE.SIZE: a limit of the module does not apply to the source", () => {
    const own: GrowthShape = { ...SHAPE, time: 2, bytes: 2, why: "a reason" };
    expect(sourceVerdict(own, row(100, 10, 1000), row(400, 40, 16_000)).faults).toStrictEqual(["source of s has a bytes exponent of 2.000, and the limit is 1.04"]);
  });

  it("COMPILE.SOURCE.SIZE: a time of generate over the generate limit of a shape fails the gate, and a time at the limit passes", () => {
    expect(sourceVerdict(HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 10 * 4 ** 1.1, 40, 4000))).toStrictEqual({ faults: [], notes: [] });
    expect(sourceVerdict(HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 10 * 4 ** 1.2, 40, 4000))).toStrictEqual({ faults: ["source of s has a generate time exponent of 1.20, and the limit is 1.1"], notes: [] });
  });

  it("COMPILE.SOURCE.SIZE: a time of load over the load limit of a shape fails the gate, and a time at the limit passes", () => {
    expect(sourceVerdict(LOAD_HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 10 * 4 ** 1.1, 4000))).toStrictEqual({ faults: [], notes: [] });
    expect(sourceVerdict(LOAD_HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 10 * 4 ** 1.2, 4000))).toStrictEqual({ faults: ["source of s has a load time exponent of 1.20, and the limit is 1.1"], notes: [] });
    expect(sourceVerdict(LOAD_HELD, sourceRow(100, 10, 10, 1000), row(400, 40, 4000))).toStrictEqual({ faults: ["source of s has a load time exponent of none, and the limit is 1.1"], notes: [] });
    expect(sourceVerdict(HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 10 * 4 ** 1.2, 4000))).toStrictEqual({ faults: [], notes: [] });
  });

  it("COMPILE.SOURCE.SIZE: a time of load over its limit is report only, it names V-089, and it does not fail the gate", () => {
    expect(sourceVerdict(HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 160, 4000))).toStrictEqual({ faults: [], notes: [`source of s has a load time exponent of 2.00, and the limit is ${String(SOURCE_TIME_LIMIT)} (V-089)`] });
    expect(sourceVerdict(HELD, sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 10 * 4 ** SOURCE_TIME_LIMIT, 4000)).notes).toStrictEqual([]);
    expect(loadExponentOf(sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 160, 4000))).toBeCloseTo(2);
    expect(loadExponentOf(row(100, 10, 1000), sourceRow(400, 40, 160, 4000))).toBeUndefined();
    expect(sourceVerdict(HELD, row(100, 10, 1000), row(400, 40, 4000))).toStrictEqual({ faults: [], notes: [] });
  });

  it("COMPILE.SOURCE.SIZE: a shape with no generate limit has no read, so its time of generate is report only", () => {
    expect(sourceVerdict(SHAPE, sourceRow(100, 10, 10, 1000), sourceRow(400, 10 * 4 ** 1.3, 40, 4000))).toStrictEqual({
      faults: [],
      notes: [`source of s has a generate time exponent of 1.30, and the limit is ${String(SOURCE_TIME_LIMIT)}, and the shape has no read of its own`],
    });
    expect(sourceVerdict(SHAPE, sourceRow(100, 10, 10, 1000), sourceRow(400, 40, 40, 4000))).toStrictEqual({ faults: [], notes: [] });
  });

  it("COMPILE.SOURCE.SIZE: a time of generate over its limit fails the gate when the bytes are report only", () => {
    const differs: GrowthRow = { ...sourceRow(400, 160, 40, 4000), sameBytes: false };
    expect(sourceVerdict(HELD, sourceRow(100, 10, 10, 1000), differs)).toStrictEqual({
      faults: ["source of s has a generate time exponent of 2.00, and the limit is 1.1"],
      notes: ["source of s has different bytes in its processes, so its bytes are report only"],
    });
  });

  it.each(GROWTH_SHAPES.filter((s) => s.source.generate !== undefined).map((s) => [s.name, s] as const))("COMPILE.SOURCE.SIZE: the flip of the gate reads red on the time of generate of %s", (_name, shape) => {
    // The clean row has the exponent of the CI read: the limit less the spread 0.12. The rows give the levels as the places, and the bytes stay.
    // The fault of the flip repeats `generate` once for each 8 levels, so the time of the large size grows by the ratio of the repeats.
    const read = (shape.source.generate ?? 0) - 0.12;
    const small = sourceRow(shape.small, 100, 100, 1000);
    const clean = sourceRow(shape.large, 100 * (shape.large / shape.small) ** read, 100, 1000);
    const faulted = { ...clean, ms: ((clean.ms ?? 0) * Math.floor(shape.large / 8)) / Math.floor(shape.small / 8) };
    expect(sourceVerdict(shape, small, clean).faults).toStrictEqual([]);
    expect(sourceVerdict(shape, small, faulted).faults).toHaveLength(1);
  });

  it("COMPILE.SOURCE.SIZE: a size with no source is a fault", () => {
    expect(sourceVerdict(SHAPE, row(100, 10, 1000), row(400, 40, undefined))).toStrictEqual({ faults: ["source of s has a size with no result"], notes: [] });
  });

  it("COMPILE.SOURCE.SIZE: a row with different bytes in its processes is report only on its bytes, and it names the shape", () => {
    const differs: GrowthRow = { ...row(400, 40, 16_000), sameBytes: false };
    expect(sourceVerdict(SHAPE, row(100, 10, 1000), differs)).toStrictEqual({ faults: [], notes: ["source of s has different bytes in its processes, so its bytes are report only"] });
    expect(sourceVerdict(SHAPE, { ...row(100, 10, 1000), sameBytes: false }, row(400, 40, 16_000)).faults).toStrictEqual([]);
    expect(sourceVerdict(SHAPE, { ...row(100, 10, 1000), sameBytes: true }, { ...row(400, 40, 16_000), sameBytes: true }).faults).toHaveLength(1);
  });

  it("COMPILE.SOURCE.SIZE: different bytes at either size are a no read of the bytes, and the same bytes are a read", () => {
    expect(bytesUnread(row(100, 10, 1000), { ...row(400, 40, 16_000), sameBytes: false })).toBe(true);
    expect(bytesUnread({ ...row(100, 10, 1000), sameBytes: false }, row(400, 40, 16_000))).toBe(true);
    expect(bytesUnread({ ...row(100, 10, 1000), sameBytes: true }, { ...row(400, 40, 16_000), sameBytes: true })).toBe(false);
    expect(bytesUnread(row(100, 10, 1000), row(400, 40, 16_000))).toBe(false);
  });

  it("COMPILE.SOURCE.SIZE: the flip of a row reads red only if the limit finds 5 % more bytes", () => {
    const tight: GrowthShape = { ...SHAPE, source: { bytes: 1.01 } };
    const loose: GrowthShape = { ...SHAPE, source: { bytes: 1.1 } };
    expect(bytesFlipReadsRed(tight, row(100, 10, 1000), row(400, 40, 4000))).toBe(true);
    expect(bytesFlipReadsRed(loose, row(100, 10, 1000), row(400, 40, 4000))).toBe(false);
    expect(bytesFlipReadsRed(loose, row(100, 10, 1000), row(400, 40, undefined))).toBe(true);
    expect(bytesFlipReadsRed(loose, row(100, 10, 1000), { ...row(400, 40, 4000), sameBytes: false })).toBe(true);
  });

  it.each(GROWTH_SHAPES.map((s) => [s.name, s] as const))("COMPILE.SOURCE.SIZE: a generate or load limit of %s states its CI run, and its small median is at least the floor", (_name, shape) => {
    expect(shape.source.generate === undefined || shape.source.why?.includes("42464464092") === true).toBe(true);
    expect(shape.source.generate === undefined || (shape.source.generateSmallMs ?? 0) >= GENERATE_FLOOR_MS).toBe(true);
    expect(shape.source.load === undefined || shape.source.why?.includes("42478066584") === true).toBe(true);
    expect(shape.source.load === undefined || (shape.source.loadSmallMs ?? 0) >= LOAD_FLOOR_MS).toBe(true);
    expect(shape.source.bytes).toBeGreaterThan(0.5);
  });
});
