/**
 * A requirement chip: the ID of a requirement and the status of its tests. The status comes from the test
 * report that `scripts/test-report.mjs` writes before the build. Without a report, the status is "unknown".
 */
import type { ReactElement } from "react";
import { escapeRegExp as escape } from "@mark1russell7/text";

interface ReportTest {
  readonly package: string;
  readonly name: string;
  readonly state: "pass" | "fail" | "skip";
}

interface Report {
  readonly generatedAt: string;
  readonly tests: readonly ReportTest[];
}

const found = import.meta.glob<{ readonly default: Report }>("../data/test-report.json", { eager: true });
const report: Report | undefined = Object.values(found)[0]?.default;

/** This function gives the tests whose names contain the ID as a whole word. */
export function testsFor(id: string): readonly ReportTest[] {
  const re = new RegExp(`(^|[^A-Z0-9.-])${escape(id)}([^A-Z0-9.-]|$)`);
  return report?.tests.filter((t) => re.test(t.name)) ?? [];
}

/** The time of the report, or `undefined`. */
export const reportTime: string | undefined = report?.generatedAt;

/** The chip. */
export default function Req(props: { readonly id: string }): ReactElement {
  const tests = testsFor(props.id);
  const state = report === undefined || tests.length === 0 ? "unknown" : tests.some((t) => t.state === "fail") ? "fail" : "pass";
  const mark = state === "pass" ? "✓" : state === "fail" ? "✗" : "?";
  const title =
    state === "unknown"
      ? "No test report for this requirement in this build."
      : `${tests.length} test${tests.length === 1 ? "" : "s"}:\n${tests.map((t) => `${t.state === "pass" ? "✓" : "✗"} ${t.package}: ${t.name}`).join("\n")}`;
  return (
    <span className="vx-chip" data-state={state} id={`req-${props.id}`} title={title}>
      {props.id}
      <span aria-hidden="true">{mark}</span>
      <span className="visually-hidden">{state === "pass" ? `${tests.length} tests pass` : state === "fail" ? "a test fails" : "status unknown"}</span>
    </span>
  );
}
