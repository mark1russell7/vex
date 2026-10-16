/**
 * The catalog of the skill of Vex (`plugins/vex/skills/vex/reference/catalog.md`). This test makes the catalog from
 * the domain objects, so the catalog and the code cannot differ. After a change of a domain, start `vitest run -u`.
 *
 * The result of an op comes from its declaration `returns`. Without it, the test calls the op with a sample of each
 * argument, and it gives the kind of the value.
 */
import { domainOf, type AnyDomain, type OpSpec, type ParamKind } from "@mark1russell7/vex";
import { Angle, AngleDomain, BoolDomain, Color, ColorDomain, DateDomain, LiftedNDVectorDomain, LocalDate, NDVector, NDVectorDomain, NumDomain, NumRecordDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { expect, it } from "vitest";

/** Each domain of the catalog: its import name, the type of its values, a sample value and a short description. */
const DOMAINS: readonly { readonly name: string; readonly d: AnyDomain; readonly type: string; readonly sample: unknown; readonly about: string }[] = [
  { name: "NumDomain", d: NumDomain, type: "number", sample: 2, about: "Numbers. A result that is not finite gives `#NUM!`." },
  { name: "BoolDomain", d: BoolDomain, type: "boolean", sample: true, about: "Booleans." },
  { name: "TextDomain", d: TextDomain, type: "string", sample: "ab", about: "Texts." },
  { name: "Vec2Domain", d: Vec2Domain, type: "Vec2", sample: new Vec2(3, 4), about: "2D vectors: `new Vec2(x, y)`, or `vec2` of `NumDomain`. A component that is not finite gives `#NUM!`." },
  { name: "NDVectorDomain", d: NDVectorDomain, type: "NDVector", sample: new NDVector({ width: 3, height: 4 }), about: "Vectors with named components. A component that one vector does not have counts as 0. No op lifts a number." },
  { name: "LiftedNDVectorDomain", d: LiftedNDVectorDomain, type: "NDVector", sample: new NDVector({ width: 3, height: 4 }), about: "The vectors of `NDVectorDomain`, but a number argument of `add`, `subtract`, `multiply` or `dot` becomes `{ scalar: n }`." },
  { name: "NumRecordDomain", d: NumRecordDomain, type: "record of numbers", sample: { width: 3, height: 4 }, about: "Plain records of finite numbers, for example from `rec`. `toNDVector` makes a vector." },
  { name: "ColorDomain", d: ColorDomain, type: "Color", sample: new Color(0.2, 0.4, 0.6), about: "RGB colors, with the WCAG ops of contrast." },
  { name: "AngleDomain", d: AngleDomain, type: "Angle", sample: Angle.fromDegrees(30), about: "Angles." },
  { name: "DateDomain", d: DateDomain, type: "LocalDate", sample: LocalDate.of(2026, 10, 16), about: "Days of the calendar, without a time. `date` of `NumDomain` makes a date." },
];

const ALL = DOMAINS.map((x) => x.d);

/** This function gives the type of a value: the type of its domain, or its JavaScript type. */
function typeOf(u: unknown): string {
  const d = domainOf(ALL, u);
  const entry = DOMAINS.find((x) => x.d === d);
  if (entry !== undefined) return entry.type;
  return Array.isArray(u) ? "list" : typeof u;
}

/** This function gives a sample of a parameter. */
function sampleOf(kind: ParamKind, self: (typeof DOMAINS)[number]): unknown {
  if (kind === "domain") return self.sample;
  if (kind === "number") return 1;
  if (kind === "boolean") return true;
  if (kind === "string") return self.d === NDVectorDomain || self.d === LiftedNDVectorDomain ? "width" : "b";
  return self.sample;
}

/** This function gives the function of an op: its `fn`, or the method of the sample value. */
const functionOf = (self: (typeof DOMAINS)[number], name: string, spec: OpSpec<unknown>): ((...a: unknown[]) => unknown) | undefined =>
  (spec.fn as ((...a: unknown[]) => unknown) | undefined) ?? (self.sample as Readonly<Record<string, ((...a: unknown[]) => unknown) | undefined>>)[name];

/** This function gives the parameters of an op: its declaration, or none for a function without parameters. */
function paramsOf(self: (typeof DOMAINS)[number], name: string, spec: OpSpec<unknown>): readonly ParamKind[] | undefined {
  if (spec.params !== undefined) return spec.params;
  const f = functionOf(self, name, spec);
  const arity = f === undefined ? undefined : spec.fn === undefined ? f.length : f.length - 1;
  return arity === 0 ? [] : undefined;
}

/** This function gives the result of an op: its declaration, or the type of the value of a call with samples. */
function resultOf(self: (typeof DOMAINS)[number], name: string, spec: OpSpec<unknown>): string {
  if (spec.returns === "domain") return self.type;
  if (spec.returns !== undefined && spec.returns !== "any") return spec.returns;
  const params = paramsOf(self, name, spec);
  if (params === undefined) return "not declared";
  const args = params.map((k) => sampleOf(k, self));
  try {
    const value = spec.fn === undefined ? (self.sample as Record<string, (...a: unknown[]) => unknown>)[name]?.(...args) : (spec.fn as (...a: unknown[]) => unknown)(self.sample, ...args);
    return value === undefined ? "not declared" : typeOf(value);
  } catch {
    return "not declared";
  }
}

/** This function gives the text of a parameter kind for a domain. */
const paramText = (kind: ParamKind, type: string): string => (kind === "domain" ? type : kind === "any" ? "value" : kind);

function domainText(self: (typeof DOMAINS)[number]): string {
  const { d, type } = self;
  const rows = Object.entries(d.ops).map(([name, raw]) => {
    const spec = raw as OpSpec<unknown>;
    const declared = paramsOf(self, name, spec);
    const params = declared === undefined ? `${type}, …` : [type, ...declared.map((k) => paramText(k, type))].join(", ");
    const lift = spec.liftScalar === true ? "yes" : Array.isArray(spec.liftScalar) ? "some" : "";
    const identity = spec.identity === undefined ? "" : d.show === undefined ? JSON.stringify(spec.identity()) : d.show(spec.identity());
    return `| \`${name}\` | \`${name}(${params})\` | ${resultOf(self, name, spec)} | ${lift} | ${(spec.laws ?? []).join(", ")} | ${identity} |`;
  });
  return [
    `## \`${self.name}\``,
    "",
    `${self.about} The values are of the type \`${type}\`.${d.fromScalar === undefined ? "" : " A number lifts to a value of the domain."}`,
    "",
    "| Op | Call | Result | Lifts numbers | Laws | Identity |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

const HEADER = `# The catalog of the domains

The test \`packages/site/src/skill-catalog.test.ts\` makes this file from the domain objects of \`@mark1russell7/vex-domains\`. Do not change it by hand.

- An op applies to a receiver, the first argument. The first domain in \`vex(...)\` whose \`is\` accepts the receiver gives the op.
- In the builder, write \`value._.op(...rest)\`. In the IR, write \`app("op", receiver, ...rest)\`.
- "Lifts numbers" means that a number argument becomes a value of the domain, for example 2 becomes the vector (2, 2).
- "Laws" are the claims of the op. The law checker of \`@mark1russell7/vex-testkit\` tests them.
- "Identity" is the value of \`reduce\` over an empty list.
- "not declared" means that the op does not declare the kinds of its result or of its parameters.

## The ops of the core

These ops apply to each value. They are not ops of a domain.

| Op | What it gives |
|---|---|
| \`if(test, then, otherwise)\` | \`then\` or \`otherwise\`. Only the selected branch evaluates. |
| \`and(...)\`, \`or(...)\` | A boolean. The evaluation stops at the first value that decides. |
| \`ifError(value, fallback)\` | \`fallback\` when \`value\` gives an error. It does not hide \`#DEPTH!\`. |
| \`count\`, \`values\`, \`keys\`, \`errors\`, \`first\` | A fact of a list, for each kind of item |
| \`sum\`, \`mean\`, \`min\`, \`max\` | A number from a list of numbers. Other items give an error. |
| \`any\`, \`all\`, \`none\` | A boolean from a list of booleans |
| \`reduce(list, op)\` | The left fold of the list with the op of the domain of the items, for example \`reduce(sizes, "max")\` |

A list op skips error items. The option \`{ strict: true }\` gives the first error.
`;

it("the catalog of the skill: the domains, their ops, and the result of each op", async () => {
  await expect(`${HEADER}\n${DOMAINS.map(domainText).join("\n\n")}\n`).toMatchFileSnapshot("../../../plugins/vex/skills/vex/reference/catalog.md");
});
