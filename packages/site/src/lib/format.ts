/**
 * Formatting helpers: short texts for values and errors, and the links to the error pages.
 */
import { domainOf, formatError, isVexList, previewValue, type ErrorCode, type Result, type VexError } from "@mark1russell7/vex";
import { DOMAINS } from "./specimen.ts";

const round = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** This function gives a short text for a value, with the `show` of its domain when there is one. */
export function show(u: unknown): string {
  if (typeof u === "number") return round(u);
  if (isVexList(u)) return `[${u.items.map((it) => `${it.key}: ${it.result.ok ? show(it.result.value) : it.result.error.code}`).join(", ")}]`;
  if (Array.isArray(u)) return `[${u.map(show).join(", ")}]`;
  const d = domainOf(DOMAINS, u);
  if (d?.show !== undefined) return d.show(u);
  return previewValue(u);
}

/** This function gives a short text for a result. */
export const showResult = (r: Result<unknown>): string => (r.ok ? show(r.value) : `${r.error.code} ${r.error.kind}`);

// The type has each error code, so a new code needs a page here.
const SLUGS: Readonly<Record<ErrorCode, string>> = {
  "#REF!": "ref",
  "#N/A": "na",
  "#VALUE!": "value",
  "#NAME?": "name",
  "#NUM!": "num",
  "#CALC!": "calc",
  "#ARGS": "args",
  "#CYCLE!": "cycle",
  "#DEPTH!": "depth",
};

/** This function gives the link to the page of an error code. */
export const errorHref = (code: string): string => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/errors/${(SLUGS as Readonly<Record<string, string>>)[code] ?? ""}/`;

/** This function gives a sentence for an error. */
export const describeError = (e: VexError): string => formatError(e);
