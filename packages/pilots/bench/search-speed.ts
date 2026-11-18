/**
 * The speed of the two forms of a step of a search (LIST.SETNTH): `setNth`, and an `each` that makes the list again. The
 * search is in `../src/list-search.ts`. It keeps one state for each node, so the cost of the `each` form grows with the
 * count of the nodes.
 *
 * Start it from the repo root with `node packages/pilots/bench/search-speed.ts`. It needs Node 24 or later, for the type
 * stripping. Both forms run in one process with `timeArmRounds` of rigor-bench. The order turns each round, and an A/A
 * copy gives the noise floor. Each input has its own rounds, and a batch of the `each` form takes 10 ms or more. A ratio
 * is the time of the arm divided by the time of the `each` form, so lower tells faster.
 *
 * `REPEATS` is the count of rounds (default 20). With `BENCH_OUT=<file>`, the script writes the rounds as JSON. The time
 * does not make the script fail. It fails only when a form does not give the reference.
 */
import { writeFileSync } from "node:fs";
import { evaluate, space } from "@mark1russell7/vex";
import { timeArmRounds } from "@mark1russell7/rigor-bench";
import { benchEnv } from "@mark1russell7/rigor-bench/fresh";
import { median } from "@mark1russell7/rigor-statistics";
import { context, envLine } from "../../core/bench/measure.ts";
import { SEARCH_DOMAINS, SEARCH_EACH, SEARCH_ITEM, searchRecords, searchReference, searchResult, type SearchResult } from "../src/list-search.ts";

const REPEATS = Number(process.env["REPEATS"] ?? 20);

type Graph = readonly (readonly number[])[];

/** A graph of `n` nodes: each node has two edges to later nodes, and the last nodes have fewer. */
const layered = (n: number): Graph => Array.from({ length: n }, (_x, i) => [i + 1, (i * 7) % n].filter((w) => w < n && w > i));

const inputs: readonly { readonly id: string; readonly value: Graph }[] = [10, 40, 160].map((n) => ({ id: `${String(n)} nodes`, value: layered(n) }));

function run(e: typeof SEARCH_ITEM, next: Graph): SearchResult {
  const r = evaluate(e, { space: space.array(searchRecords(next)), origin: "0", domains: SEARCH_DOMAINS });
  if (!r.ok) throw new Error(r.error.message);
  return searchResult(r.value);
}

for (const { id, value } of inputs) {
  const want = JSON.stringify(searchReference(value));
  for (const e of [SEARCH_EACH, SEARCH_ITEM]) if (JSON.stringify(run(e, value)) !== want) throw new Error(`a form does not give the reference on ${id}`);
}

// The arms give 0: the result of a search has no number that sums, and the evaluation of a program is not dead code.
const report = inputs.map(({ id, value }, at) => {
  const rounds = timeArmRounds({
    case: id,
    base: { id: "each", run: () => (run(SEARCH_EACH, value), 0) },
    candidates: [{ id: "setNth", run: () => (run(SEARCH_ITEM, value), 0) }],
    rounds: REPEATS,
    offset: at,
    warmBatches: 1,
  });
  return { id, count: rounds.count, orders: rounds.orders, pairs: rounds.pairs };
});

console.log(envLine("process"));
for (const { id, count, pairs } of report) {
  const both = pairs["setNth"] ?? [];
  const aa = pairs["each~aa"] ?? [];
  const perCall = (ms: readonly number[]): string => (median(ms) / count).toFixed(2);
  console.log(`${id.padEnd(12)} each ${perCall(both.map((p) => p.a))} ms  setNth ${perCall(both.map((p) => p.b))} ms  ratio ${median(both.map((p) => p.b / p.a)).toFixed(3)}  A/A ${median(aa.map((p) => p.b / p.a)).toFixed(3)}`);
}

const file = process.env["BENCH_OUT"];
if (file !== undefined && file !== "") writeFileSync(file, JSON.stringify({ env: benchEnv(), context: context(), inputs: report }, null, 2));
