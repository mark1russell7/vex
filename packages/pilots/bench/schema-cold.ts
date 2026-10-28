/**
 * The cold time of the schema pilot (EXAMPLE.SCHEMA), for the speed job of the nightly workflow. Graph pays this time
 * when a process evaluates the pilot for the first time.
 *
 * Start it from the repo root with `node packages/pilots/bench/schema-cold.ts`. It starts `COLD_N` new processes
 * (default 10), one after the other. Each process measures four parts of its first sample:
 *
 * - `import`: the time to load Vex, the domains and the pilot.
 * - `compile`: the time of `compile` for the program.
 * - `first`: the time of the first `run` of the compiled program.
 * - `second`: the time of the next `run`.
 *
 * The script prints the median of each part, and the lowest and the highest value of the processes. With
 * `BENCH_OUT=<file>`, it also writes the records as JSON. It fails (exit 1) when a run gives an error.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The times in ms of the first sample of one new process. */
interface Cold {
  readonly import: number;
  readonly compile: number;
  readonly first: number;
  readonly second: number;
}

const PARTS = ["import", "compile", "first", "second"] as const;

/** This function measures the first sample in this process, and prints the times as one line of JSON. */
async function child(): Promise<void> {
  const t0 = performance.now();
  const vex: typeof import("@mark1russell7/vex") = await import("@mark1russell7/vex");
  const pilot: typeof import("../src/schema.ts") = await import("../src/schema.ts");
  const t1 = performance.now();
  const program = vex.compile(pilot.SCHEMA_PROGRAM, { domains: pilot.SCHEMA_DOMAINS });
  const t2 = performance.now();
  // The input of the speed case of schema.test.ts: 20 documents of 30 fields.
  const docs = Array.from({ length: 20 }, (_doc, d) => Object.fromEntries(Array.from({ length: 30 }, (_field, f) => [`f${String(f)}`, f % 3 === 0 ? { a: { b: [d, "x"] } } : f % 3 === 1 ? d : [d, null]])));
  const opts = { space: vex.space.array([{}]), origin: "0", vars: { docs } };
  const t3 = performance.now();
  const r1 = program.run(opts);
  const t4 = performance.now();
  const r2 = program.run(opts);
  const t5 = performance.now();
  if (!r1.ok || !r2.ok) {
    console.error("The pilot gave an error.");
    process.exit(1);
  }
  const cold: Cold = { import: t1 - t0, compile: t2 - t1, first: t4 - t3, second: t5 - t4 };
  console.info(JSON.stringify(cold));
}

/** This function starts the new processes and prints the median, the lowest and the highest value of each part. */
function parent(): void {
  const n = Number(process.env["COLD_N"] ?? 10);
  const file = fileURLToPath(import.meta.url);
  const runs: Cold[] = [];
  for (let i = 0; i < n; i++) {
    const p = spawnSync(process.execPath, [file], { env: { ...process.env, COLD_CHILD: "1" }, encoding: "utf8" });
    const line = p.stdout.trim().split("\n").at(-1) ?? "";
    if (p.status !== 0 || line === "") {
      console.error(`Process ${String(i)} failed: ${p.stderr}`);
      process.exit(1);
    }
    runs.push(JSON.parse(line) as Cold);
  }
  const stats = Object.fromEntries(
    PARTS.map((part) => {
      const ts = runs.map((r) => r[part]).sort((a, b) => a - b);
      return [part, { median: ts[Math.floor(ts.length / 2)] ?? Number.NaN, low: ts[0] ?? Number.NaN, high: ts.at(-1) ?? Number.NaN }];
    }),
  );
  for (const part of PARTS) {
    const s = stats[part];
    if (s !== undefined) console.info(`cold ${part.padEnd(10)} median ${s.median.toFixed(2).padStart(8)} ms  low ${s.low.toFixed(2).padStart(8)}  high ${s.high.toFixed(2).padStart(8)}  (${String(n)} new processes)`);
  }
  const out = process.env["BENCH_OUT"];
  if (out !== undefined && out !== "") writeFileSync(out, JSON.stringify({ node: process.version, processes: n, parts: stats, runs }, null, 2));
}

if (process.env["COLD_CHILD"] === "1") await child();
else parent();
