/**
 * The speed of the two forms of a step of a search (LIST.SETNTH): `setNth`, and an `each` that makes the list again. The
 * search is in `../src/list-search.ts`. It keeps one state for each node, so the cost of the `each` form grows with the
 * count of the nodes.
 *
 * Start it from the repo root with `node packages/pilots/bench/search-speed.ts`. It needs Node 24 or later, for the type
 * stripping. Both forms run in one process, with the order turned each round, and an A/A copy gives the noise floor. A
 * ratio is the time of the arm divided by the time of the `each` form, so lower tells faster.
 *
 * `REPEATS` is the count of rounds (default 20). With `BENCH_OUT=<file>`, the script writes the report as JSON. The time
 * does not make the script fail. It fails only when a form does not give the reference.
 */
import { writeFileSync } from "node:fs";
import { evaluate, space } from "@mark1russell7/vex";
import { envLine, measureIsolated, type Input } from "../../core/bench/measure.ts";
import { SEARCH_DOMAINS, SEARCH_EACH, SEARCH_ITEM, searchRecords, searchReference, searchResult, type SearchResult } from "../src/list-search.ts";

const REPEATS = Number(process.env["REPEATS"] ?? 20);

type Graph = readonly (readonly number[])[];

/** A graph of `n` nodes: each node has two edges to later nodes, and the last nodes have fewer. */
const layered = (n: number): Graph => Array.from({ length: n }, (_x, i) => [i + 1, (i * 7) % n].filter((w) => w < n && w > i));

const inputs: readonly Input<Graph>[] = [10, 40, 160].map((n) => ({ id: `${String(n)} nodes`, value: layered(n) }));

function run(e: typeof SEARCH_ITEM, next: Graph): SearchResult {
  const r = evaluate(e, { space: space.array(searchRecords(next)), origin: "0", domains: SEARCH_DOMAINS });
  if (!r.ok) throw new Error(r.error.message);
  return searchResult(r.value);
}

for (const { id, value } of inputs) {
  const want = JSON.stringify(searchReference(value as Graph));
  for (const e of [SEARCH_EACH, SEARCH_ITEM]) if (JSON.stringify(run(e, value as Graph)) !== want) throw new Error(`a form does not give the reference on ${id}`);
}

const report = measureIsolated<Graph>({
  arms: [
    { id: "each", run: (next) => run(SEARCH_EACH, next) },
    { id: "setNth", run: (next) => run(SEARCH_ITEM, next) },
  ],
  inputs,
  repeats: REPEATS,
  warmup: 2,
  mode: "process",
});

console.log(envLine("process", report.env));
for (const input of report.inputs) console.log(`${input.id.padEnd(12)} each ${(input.median["each"] ?? 0).toFixed(2)} ms  setNth ${(input.median["setNth"] ?? 0).toFixed(2)} ms  ratio ${(input.ratio["setNth"] ?? 0).toFixed(3)}  A/A ${(input.ratio["each~aa"] ?? 0).toFixed(3)}`);

const file = process.env["BENCH_OUT"];
if (file !== undefined && file !== "") writeFileSync(file, JSON.stringify(report, null, 2));
