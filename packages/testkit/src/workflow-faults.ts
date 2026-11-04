/**
 * The check that a workflow does not hide a failed test. `|| true` after a test gives a green job for a failed
 * property. A pipe gives the same result when the shell has no `pipefail`. `continue-on-error` gives it for a step or a
 * job. `scripts/workflow-gate.ts` starts this check on each workflow, in all branches. The package does not export it,
 * and npm does not get it.
 *
 * A run by hand can start on a branch with no pull request, and a report can cite its artifact or its log. So each job
 * of such a workflow with a runtime or an upload starts the gate itself, as its first step after the runtime. The only
 * exception is a line of `NO_RECORD`, with its reason. So a new workflow fails by default.
 */

/** The workflows with a run by hand that make no record, each with its reason. An entry with no such workflow is a fault. */
export const NO_RECORD: Readonly<Record<string, string>> = {
  "pages.yml": "It publishes the site with a reusable workflow, and no report cites it.",
  "release.yml": "It publishes the packages with the standard of the release, and no report cites it.",
  "security.yml": "It starts a reusable scan, and no report cites it.",
};


/** This pattern finds a command that starts tests. */
const TEST_COMMAND = /\bvitest\b|\bpnpm (?:run )?(?:test|check)\b/u;
/** This pattern finds the start of the next command after a test: a pipe or `||`. */
const AFTER_TEST = /(?:\bvitest\b|\bpnpm (?:run )?(?:test|check)\b).*?(\|\|?)/u;
/** This pattern finds a job of a workflow. A job has two spaces of indent. */
const JOB = /^ {2}[\w-]+:\s*$/u;
/** This pattern finds a step of a job. */
const STEP = /^\s*- (?:name|uses|run|id|if|shell|env|with|working-directory):?/u;
/** This pattern finds a setting that gives a job or a step the option `pipefail`. */
const PIPEFAIL = /\bshell: bash\b|\bpipefail\b/u;
/** This pattern finds the setting that hides a failure. */
const IGNORED = /^\s*continue-on-error: true\s*$/u;
/** This pattern finds the trigger of a run by hand. */
const DISPATCH = /\bworkflow_dispatch\b/u;
/** This pattern finds a step that uploads an artifact. */
const UPLOAD = /^\s*(?:- )?uses: actions\/upload-artifact@/u;
/** This pattern finds the step that gives the runtime. */
const RUNTIME = /^\s*(?:- )?uses: actions\/setup-node@/u;
/** This pattern finds the step that starts the gate. */
const GATE = /^\s*(?:- )?run: node scripts\/workflow-gate\.ts\s*$/u;

/** This function removes each comment line and each quoted text. Thus a word in them starts no test, and a `|` in them is no pipe. */
const code = (lines: readonly string[]): readonly string[] => lines.map((l) => (/^\s*#/u.test(l) ? "" : l.replace(/"[^"]*"|'[^']*'/gu, '""')));

/** This function tells if some lines start tests. */
const hasTests = (lines: readonly string[]): boolean => lines.some((l) => TEST_COMMAND.test(l));

/** This function splits some lines at each line that `start` finds. The lines before the first start are the head. */
function blocks(lines: readonly string[], start: RegExp): { readonly head: readonly string[]; readonly parts: readonly (readonly string[])[] } {
  const at = lines.flatMap((l, i) => (start.test(l) ? [i] : []));
  return { head: lines.slice(0, at[0] ?? lines.length), parts: at.map((from, i) => lines.slice(from, at[i + 1] ?? lines.length)) };
}

/** This function tells if one line of a step agrees with a pattern. */
const stepHas = (step: readonly string[] | undefined, pattern: RegExp): boolean => (step ?? []).some((l) => pattern.test(l));

/** This function tells if the first step after the runtime starts the gate. A job with no runtime does not start it. */
function gateFirst(steps: readonly (readonly string[])[]): boolean {
  const runtime = steps.findIndex((s) => stepHas(s, RUNTIME));
  return runtime >= 0 && stepHas(steps[runtime + 1], GATE);
}

/** This function gives the faults of the lines of one job. `outer` tells if the head of the workflow sets `pipefail`, and `byHand` tells if the rule of a run by hand applies. */
function jobFaults(job: readonly string[], outer: boolean, byHand: boolean): readonly string[] {
  const name = (job[0] as string).trim().replace(/:$/u, "");
  const { head, parts } = blocks(job, STEP);
  const pipefail = outer || head.some((l) => PIPEFAIL.test(l));
  const faults: string[] = [];
  if (head.some((l) => IGNORED.test(l)) && hasTests(job)) faults.push(`${name}: the job has tests and continue-on-error`);
  if (byHand && (stepHas(job, UPLOAD) || stepHas(job, RUNTIME)) && !gateFirst(parts)) faults.push(`${name}: a job of a run by hand needs the gate as its first step after the runtime`);
  for (const step of parts) {
    if (step.some((l) => IGNORED.test(l)) && hasTests(step)) faults.push(`${name}: a step has tests and continue-on-error`);
    for (const line of step) {
      const after = AFTER_TEST.exec(line)?.[1];
      if (after === "||") faults.push(`${name}: || after a test: ${line.trim()}`);
      if (after === "|" && !pipefail && !step.some((l) => PIPEFAIL.test(l))) faults.push(`${name}: a pipe after a test with no pipefail: ${line.trim()}`);
    }
  }
  return faults;
}

/** This function gives a line for each fault of a workflow: a hidden failed test, or a run by hand with no gate. `file` is its file name. The rule of a run by hand skips a name of `NO_RECORD`. */
export function workflowFaults(text: string, file = ""): readonly string[] {
  const lines = code(text.split("\n"));
  const start = lines.findIndex((l) => /^jobs:\s*$/u.test(l));
  if (start < 0) return [];
  const { parts } = blocks(lines.slice(start + 1), JOB);
  const top = lines.slice(0, start);
  const outer = top.some((l) => PIPEFAIL.test(l));
  const byHand = !Object.hasOwn(NO_RECORD, file) && top.some((l) => DISPATCH.test(l));
  const faults = parts.flatMap((job) => jobFaults(job, outer, byHand));
  const gated = parts.some((job) => stepHas(job, RUNTIME) || stepHas(job, GATE));
  return byHand && !gated ? [...faults, "a run by hand needs a job that starts the gate"] : faults;
}

/** This function gives a line for each entry of `list` with no workflow of a run by hand. `texts` maps each file name to its text. */
export function listFaults(texts: ReadonlyMap<string, string>, list: Readonly<Record<string, string>> = NO_RECORD): readonly string[] {
  return Object.keys(list).flatMap((file) => (DISPATCH.test(code((texts.get(file) ?? "").split("\n")).join("\n")) ? [] : [`${file}: an entry of NO_RECORD with no run by hand`]));
}
