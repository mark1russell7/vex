/** A run of one branch: the old and the new hand arm of the schema bench, in one job on one runner. */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { cpus } from "node:os";

const docs = Array.from({ length: 20 }, (_doc, d) => Object.fromEntries(Array.from({ length: 30 }, (_field, f) => [`f${String(f)}`, f % 3 === 0 ? { a: { b: [d, "x"] } } : f % 3 === 1 ? d : [d, null]])));
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const arm = process.argv[2];
if (arm !== undefined) {
  const { schemaReference } = (await import(arm === "new" ? "../src/schema-reference.ts" : "./old-arm.ts")) as { schemaReference: (d: readonly unknown[]) => unknown };
  for (let i = 0; i < 3000; i += 1) schemaReference(docs);
  const times: number[] = [];
  for (let batch = 0; batch < 41; batch += 1) {
    const t = performance.now();
    for (let i = 0; i < 200; i += 1) schemaReference(docs);
    times.push((performance.now() - t) / 200);
  }
  console.info(JSON.stringify({ ms: median(times), result: JSON.stringify(schemaReference(docs)) }));
} else {
  const ARMS = ["old", "new", "old-again"];
  const ROUNDS = 21;
  const rows: Record<string, number[]> = { old: [], new: [], "old-again": [] };
  const results = new Set<string>();
  for (let round = 0; round < ROUNDS; round += 1) {
    for (let i = 0; i < ARMS.length; i += 1) {
      const name = ARMS[(i + round) % ARMS.length]!;
      const r = spawnSync(process.execPath, [process.argv[1]!, name], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(r.stderr);
      const { ms, result } = JSON.parse(r.stdout) as { ms: number; result: string };
      rows[name]!.push(ms);
      results.add(result);
    }
  }
  if (results.size !== 1) throw new Error("the arms give different results");
  const pairs = (a: string, b: string): number[] => rows[a]!.map((x, i) => x / rows[b]![i]!);
  const line = (name: string, xs: number[]): string => `${name}: median ${median(xs).toFixed(3)}, range ${Math.min(...xs).toFixed(3)} to ${Math.max(...xs).toFixed(3)}, n ${xs.length}`;
  const text = [
    `cpu ${cpus()[0]?.model}, node ${process.version}`,
    `old ms ${median(rows["old"]!).toFixed(4)}, new ms ${median(rows["new"]!).toFixed(4)}, old-again ms ${median(rows["old-again"]!).toFixed(4)}`,
    line("new/old", pairs("new", "old")),
    line("A/A old-again/old", pairs("old-again", "old")),
  ].join("\n");
  console.info(text);
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `\`\`\`\n${text}\n\`\`\`\n`);
}
