/**
 * The golden catalog of the domains: the name of each domain, and for each op its parameters, its lifting, its laws,
 * its identity and its kind (a function or a method). The interpreter reads these declarations: a law lets a
 * reduction change the order, and the parameters let the interpreter check the arguments. Thus a change of a
 * declaration is a change of the semantics, and it shows as a readable diff of `__golden__/catalog.txt`.
 */
import type { AnyDomain, OpSpec } from "@mark1russell7/vex";
import { expect, it } from "vitest";
import { AngleDomain } from "./angle.ts";
import { DateDomain } from "./date.ts";
import { ColorDomain } from "./color.ts";
import { LiftedNDVectorDomain, NDVectorDomain, NumRecordDomain } from "./ndvector.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";
import { Vec2Domain } from "./vec2.ts";
import { XYDomain } from "./xy.ts";
import { FnDomain, MaybeDomain } from "./wrappers.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, Vec2Domain, XYDomain, ColorDomain, AngleDomain, DateDomain, NDVectorDomain, LiftedNDVectorDomain, NumRecordDomain, FnDomain, MaybeDomain];

/** This function gives the text of a value with the `show` of the domain, or its JSON text. */
const shown = (d: AnyDomain, u: unknown): string => (d.show === undefined ? JSON.stringify(u) : d.show(u));

/** This function gives one line for an op. A missing field and an empty field give different text. */
function opLine(d: AnyDomain, name: string, spec: OpSpec<unknown>): string {
  const parts = [`  ${name}(${spec.params === undefined ? "?" : spec.params.join(", ")})`];
  parts.push(spec.liftScalar === undefined ? "no lift" : `lift ${JSON.stringify(spec.liftScalar)}`);
  parts.push(spec.laws === undefined ? "no laws" : `laws [${spec.laws.join(", ")}]`);
  parts.push(spec.identity === undefined ? "no identity" : `identity ${shown(d, spec.identity())}`);
  parts.push(spec.fn === undefined ? "method" : "fn");
  return parts.join(" | ");
}

/** This function gives the text of a domain: its name, its optional hooks, and one line for each op. */
function domainText(d: AnyDomain): string {
  const hooks = [
    `fromScalar ${d.fromScalar === undefined ? "-" : shown(d, d.fromScalar(2))}`,
    `valid ${d.valid === undefined ? "-" : "yes"}`,
    `encode ${d.encode === undefined ? "-" : "yes"}`,
    `methods ${d.methods ?? "-"}`,
  ];
  return [`${d.name} (${hooks.join(", ")})`, ...Object.entries(d.ops).map(([name, spec]) => opLine(d, name, spec as OpSpec<unknown>))].join("\n");
}

it("the catalog of the domains: names, parameters, lifting, laws and identities", async () => {
  await expect(`${DOMAINS.map(domainText).join("\n\n")}\n`).toMatchFileSnapshot("./__golden__/catalog.txt");
});
