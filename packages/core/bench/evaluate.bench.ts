/**
 * The speed lane (docs/REVIEW.md §8.2, layer L10). The nightly workflow runs `vitest bench` and keeps the report.
 * Each test compares a Vex program with the same computation in hand-written TypeScript. The report has no time
 * limit. The gate (`gate.ts`) checks the ratio of Vex to the loops for each program.
 */
import { test } from "vitest";
import { compile, evaluate } from "../src/evaluate.ts";
import { parse, serialize } from "../src/json.ts";
import { PtDomain } from "../src/test-support.ts";
import { LIFE, NEAREST } from "./programs.ts";

const { root, chain: nearest, keys } = NEAREST;
const compiled = compile(nearest.program, { domains: [PtDomain] });

test("the nearest other box, at each of 60 keys", async ({ bench }) => {
  await bench.compare(
    bench("vex: all() of the chain", () => {
      nearest.all();
    }),
    bench("vex: one compiled program, run at each key", () => {
      for (const k of keys) compiled.run({ space: root.space, origin: k });
    }),
    bench("vex: evaluate of the IR", () => {
      for (const k of keys) evaluate(nearest.program, { space: root.space, origin: k, domains: [PtDomain] });
    }),
    bench("hand-written loops", NEAREST.hand),
  );
});

test("the builder and the JSON form", async ({ bench }) => {
  await bench.compare(
    bench("build the chain", () => {
      root.from("position").others((e) => e._.subtract("position")._.length()).min();
    }),
    bench("serialize and parse the program", () => {
      const text = serialize(nearest.program, [PtDomain]);
      if (text.ok) parse(text.value, [PtDomain]);
    }),
  );
});

test("one step of the Game of Life on a 16 by 16 grid", async ({ bench }) => {
  await bench.compare(bench("vex: neighbors(8) with where, then count()", LIFE.vex), bench("hand-written loops", LIFE.hand));
});
