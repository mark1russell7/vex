/**
 * The tests of the check that a workflow does not hide a failed test. The text `keyscope-names` is the real line that
 * hid two failed properties of run 41886163314.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { workflowFaults } from "./workflow-faults.ts";

const ROOT = resolve(import.meta.dirname, "../../..");

/** This function gives a workflow with one job and the lines `steps`. */
const job = (steps: readonly string[], jobLines: readonly string[] = [], head: readonly string[] = []): string =>
  ["name: x", ...head, "jobs:", "  one:", "    runs-on: ubuntu-latest", ...jobLines, "    steps:", ...steps.map((l) => `      ${l}`)].join("\n");

describe("the check that a workflow does not hide a failed test", () => {
  it("finds || after a test, the line that hid a failed property", () => {
    expect(workflowFaults(job(['- run: pnpm exec vitest run src/module.test.ts --maxWorkers=1 -t "V-081" || true']))).toStrictEqual(['one: || after a test: - run: pnpm exec vitest run src/module.test.ts --maxWorkers=1 -t "" || true']);
  });

  it("finds || after each command that starts tests", () => {
    expect(workflowFaults(job(["- run: pnpm test || true"]))).toHaveLength(1);
    expect(workflowFaults(job(["- run: pnpm run test:coverage || echo no"]))).toHaveLength(1);
    expect(workflowFaults(job(["- run: pnpm check || true"]))).toHaveLength(1);
    expect(workflowFaults(job(["- run: pnpm run check || true"]))).toHaveLength(1);
  });

  it("finds || in a function of a block of a step", () => {
    expect(workflowFaults(job(["- name: measure", "  run: |", '    measure() { pnpm exec vitest run x.ts 2>&1 | grep -E "A" || true; }']))).toHaveLength(1);
  });

  it("finds a pipe after a test with no pipefail", () => {
    expect(workflowFaults(job(["- run: pnpm exec vitest run x.ts | tee out.txt"]))).toStrictEqual(["one: a pipe after a test with no pipefail: - run: pnpm exec vitest run x.ts | tee out.txt"]);
  });

  it("accepts a pipe with pipefail at each place of the setting", () => {
    const pipe = "- run: pnpm exec vitest run x.ts | tee out.txt";
    expect(workflowFaults(job([pipe, "  shell: bash"]))).toStrictEqual([]);
    expect(workflowFaults(job(["- run: |", "    set -o pipefail", "    pnpm exec vitest run x.ts | tee out.txt"]))).toStrictEqual([]);
    expect(workflowFaults(job([pipe], ["    defaults:", "      run:", "        shell: bash"]))).toStrictEqual([]);
    expect(workflowFaults(job([pipe], [], ["defaults:", "  run:", "    shell: bash"]))).toStrictEqual([]);
  });

  it("does not take the pipefail of a step or of a job for another", () => {
    const text = job(["- run: pnpm exec vitest run x.ts | tee a.txt", "  shell: bash", "- run: pnpm exec vitest run y.ts | tee b.txt"]);
    expect(workflowFaults(text)).toStrictEqual(["one: a pipe after a test with no pipefail: - run: pnpm exec vitest run y.ts | tee b.txt"]);
    const two = `${job(["- run: pnpm exec vitest run a.ts | tee a.txt"], ["    defaults:", "      run:", "        shell: bash"])}\n  two:\n    steps:\n      - run: pnpm exec vitest run b.ts | tee b.txt`;
    expect(workflowFaults(two)).toStrictEqual(["two: a pipe after a test with no pipefail: - run: pnpm exec vitest run b.ts | tee b.txt"]);
  });

  it("finds continue-on-error on a step or on a job with tests", () => {
    expect(workflowFaults(job(["- run: pnpm test", "  continue-on-error: true"]))).toStrictEqual(["one: a step has tests and continue-on-error"]);
    expect(workflowFaults(job(["- run: pnpm test"], ["    continue-on-error: true"]))).toStrictEqual(["one: the job has tests and continue-on-error"]);
  });

  it("accepts continue-on-error with no tests, and a word of a comment", () => {
    expect(workflowFaults(job(["- run: pnpm typecheck"], ["    continue-on-error: true"]))).toStrictEqual([]);
    expect(workflowFaults(job(["- run: pnpm build", "  continue-on-error: true"]))).toStrictEqual([]);
    expect(workflowFaults(job(["# pnpm exec vitest run x.ts || true", "- run: pnpm build"]))).toStrictEqual([]);
  });

  it("accepts a | in a quoted name of a test", () => {
    expect(workflowFaults(job(['- run: pnpm exec vitest run x.ts -t "a|b"', "- run: pnpm exec vitest run y.ts -t 'c|d'"]))).toStrictEqual([]);
  });

  it("accepts a test with no later command, and a line with || and no test", () => {
    expect(workflowFaults(job(["- run: pnpm exec vitest run x.ts"]))).toStrictEqual([]);
    expect(workflowFaults(job(["- run: test -f x || exit 1", "- run: cat x | grep y"]))).toStrictEqual([]);
  });

  it("gives no fault for a text with no jobs", () => {
    expect(workflowFaults("name: x\non: push")).toStrictEqual([]);
  });

  it("finds no fault in the workflows of this repository", () => {
    const dir = resolve(ROOT, ".github/workflows");
    const faults = readdirSync(dir).flatMap((f) => workflowFaults(readFileSync(resolve(dir, f), "utf8")).map((x) => `${f}: ${x}`));
    expect(faults).toStrictEqual([]);
  });
});

describe("the check that a record of a run by hand has the gate first", () => {
  const CHECKOUT = "- uses: actions/checkout@abc # v7";
  const RUNTIME = ["- uses: actions/setup-node@abc # v7", "  with:", "    node-version: 26"];
  const GATE = "- run: node scripts/workflow-gate.ts";
  const UPLOAD = ["- uses: actions/upload-artifact@abc # v7", "  with:", "    name: x"];
  const DISPATCH = ["on:", "  workflow_dispatch:"];
  const FAULT = "one: a job that uploads a record in a run by hand needs the gate as its first step after the runtime";

  it("finds a job that uploads a record with no gate", () => {
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, "- run: pnpm build", ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
  });

  it("accepts a job with the gate as its first step after the runtime", () => {
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, GATE, "- run: pnpm build", ...UPLOAD], [], DISPATCH))).toStrictEqual([]);
  });

  it("finds a gate at another place than the first step after the runtime", () => {
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, "- run: pnpm build", GATE, ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
    expect(workflowFaults(job([CHECKOUT, GATE, ...RUNTIME, "- run: pnpm build", ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
  });

  it("finds a job with no runtime, and a job with the runtime as its last step", () => {
    expect(workflowFaults(job([GATE, CHECKOUT, ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
    expect(workflowFaults(job([CHECKOUT, ...UPLOAD, ...RUNTIME], [], DISPATCH))).toStrictEqual([FAULT]);
  });

  it("finds a gate in a comment, a name or a longer command", () => {
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, `# ${GATE}`, ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, "- name: node scripts/workflow-gate.ts", "  run: pnpm build", ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, `${GATE} || true`, ...UPLOAD], [], DISPATCH))).toStrictEqual([FAULT]);
  });

  it("accepts the gate and the upload with a name of the step", () => {
    const named = ["- name: Gate", "  run: node scripts/workflow-gate.ts"];
    const upload = ["- name: Keep the record", "  uses: actions/upload-artifact@abc # v7"];
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, ...named, ...upload], [], DISPATCH))).toStrictEqual([]);
  });

  it("finds a named upload, and a trigger in a list", () => {
    const upload = ["- name: Keep the record", "  uses: actions/upload-artifact@abc # v7"];
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, ...upload], [], DISPATCH))).toStrictEqual([FAULT]);
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, ...UPLOAD], [], ["on: [push, workflow_dispatch]"]))).toStrictEqual([FAULT]);
  });

  it("accepts a workflow with no run by hand, and a job with no upload", () => {
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, ...UPLOAD], [], ["on:", "  push:"]))).toStrictEqual([]);
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, "- run: pnpm build"], [], DISPATCH))).toStrictEqual([]);
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, "- uses: actions/upload-pages-artifact@abc # v4"], [], DISPATCH))).toStrictEqual([]);
  });

  it("reads a comment on the trigger as no trigger", () => {
    expect(workflowFaults(job([CHECKOUT, ...RUNTIME, ...UPLOAD], [], ["on:", "  push:", "  # workflow_dispatch:"]))).toStrictEqual([]);
  });

  it("names each job that uploads a record", () => {
    const two = `${job([CHECKOUT, ...RUNTIME, GATE, ...UPLOAD], [], DISPATCH)}\n  two:\n    runs-on: ubuntu-latest\n    steps:\n${[CHECKOUT, ...RUNTIME, ...UPLOAD].map((l) => `      ${l}`).join("\n")}`;
    expect(workflowFaults(two)).toStrictEqual([FAULT.replace("one", "two")]);
  });
});
