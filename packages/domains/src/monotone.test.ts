/**
 * The directions of the ops (FIX.OPS). A proof of a step of `fix` trusts these claims, so this file tests each claim on
 * a grid of values. The grid has the values where a claim breaks most often: 0, the signs and the halves.
 */
import type { AnyDomain, OpSpec } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { BoolDomain, NumDomain } from "./scalars.ts";

const NUMBERS: readonly number[] = [-1000, -2.5, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2.5, 1000];
const BOOLEANS: readonly boolean[] = [false, true];

/** This function gives each list of `n` values of the grid. */
function tuples<T>(grid: readonly T[], n: number): readonly (readonly T[])[] {
  if (n === 0) return [[]];
  return tuples(grid, n - 1).flatMap((rest) => grid.map((x) => [x, ...rest]));
}

/** This function gives the ops of a domain that state a direction. */
function claims(domain: AnyDomain): readonly [string, OpSpec<unknown>][] {
  return Object.entries(domain.ops as Readonly<Record<string, OpSpec<unknown>>>).filter(([, spec]) => spec.monotone !== undefined);
}

/** This function gives the count of the arguments that break a claim, for a move up of each argument in the grid. */
function broken<T>(spec: OpSpec<unknown>, grid: readonly T[], order: (a: T, b: T) => number): number {
  const rule = spec.monotone ?? [];
  const call = (args: readonly T[]): T => (spec.fn as (...xs: readonly T[]) => T)(...args);
  let bad = 0;
  for (const args of tuples(grid, rule.length)) {
    args.forEach((value, i) => {
      for (const higher of grid.filter((x) => order(x, value) > 0)) {
        const next = order(call(args.with(i, higher)), call(args));
        if (rule[i] === "up" ? next < 0 : next > 0) bad++;
      }
    });
  }
  return bad;
}

describe("the directions of the ops (FIX.OPS)", () => {
  it("FIX.OPS: each number op with a direction keeps its claim on the grid", () => {
    const ops = claims(NumDomain);
    expect(ops.map(([name]) => name).toSorted()).toEqual(["add", "ceil", "clamp", "floor", "max", "min", "negate", "round", "sign", "subtract"]);
    for (const [, spec] of ops) expect(broken(spec, NUMBERS, (a, b) => a - b)).toBe(0);
  });

  it("FIX.OPS: each boolean op with a direction keeps its claim on the grid", () => {
    const ops = claims(BoolDomain);
    expect(ops.map(([name]) => name).toSorted()).toEqual(["and", "not", "or"]);
    for (const [, spec] of ops) expect(broken(spec, BOOLEANS, (a, b) => Number(a) - Number(b))).toBe(0);
  });

  it("FIX.OPS: an op that has no direction has no claim, and the test finds a false claim", () => {
    expect(NumDomain.ops.multiply?.monotone).toBeUndefined();
    expect(NumDomain.ops.abs?.monotone).toBeUndefined();
    expect(NumDomain.ops.gt?.monotone).toBeUndefined();
    const wrong = { fn: (a: number): number => a * a, monotone: ["up"] } as unknown as OpSpec<unknown>;
    expect(broken(wrong, NUMBERS, (a, b) => a - b)).toBeGreaterThan(0);
    const flipped = { fn: (a: number): number => a, monotone: ["down"] } as unknown as OpSpec<unknown>;
    expect(broken(flipped, NUMBERS, (a, b) => a - b)).toBeGreaterThan(0);
  });
});
