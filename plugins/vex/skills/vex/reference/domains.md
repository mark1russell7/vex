# Make a domain

A domain tells Vex which values belong to it and which ops they have. Make one when a value has its own ops. The signs are in [the skill](../SKILL.md#make-vex-better).

## An example

An interval of numbers, for example the extent of some items on one axis. The values are plain data, and each op is a function. Thus a standalone module can copy the domain.

```ts doctest
import { defineDomain, space, vex } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { checkLaws } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";

interface Interval {
  readonly lo: number;
  readonly hi: number;
}

const IntervalDomain = defineDomain({
  name: "Interval",
  is: (u: unknown): u is Interval => typeof u === "object" && u !== null && Object.keys(u).length === 2 && typeof (u as Interval).lo === "number" && typeof (u as Interval).hi === "number",
  valid: (r: Interval): boolean => Number.isFinite(r.lo) && Number.isFinite(r.hi) && r.lo <= r.hi,
  fromScalar: (n: number): Interval => ({ lo: n, hi: n }),
  show: (r: Interval): string => `[${r.lo}, ${r.hi}]`,
  samples: (): readonly Interval[] => [{ lo: 0, hi: 1 }, { lo: -2, hi: 5 }],
  ops: {
    union: {
      fn: (a: Interval, b: Interval): Interval => ({ lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) }),
      laws: ["commutative", "associative", "idempotent"],
      liftScalar: true,
      params: ["domain"],
      returns: "domain",
    },
    width: { fn: (a: Interval): number => a.hi - a.lo, params: [], returns: "number" },
    contains: { fn: (a: Interval, x: number): boolean => a.lo <= x && x <= a.hi, params: ["number"], returns: "boolean" },
  },
});

const rows = vex(NumDomain, IntervalDomain).over(space.array([{ span: { lo: 0, hi: 4 } }, { span: { lo: 2, hi: 9 } }]));
const extent = rows.start(0).each((t) => t.from("span")).reduce("union");

extent._.width().at("0");          // => { tag: "some", value: 9 }
rows.from("span")._.union(12).at("1"); // => { tag: "some", value: { lo: 2, hi: 12 } }

const intervals = fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 50 })).map(([lo, w]) => ({ lo, hi: lo + w }));
checkLaws(IntervalDomain, { arb: intervals }).every((r) => r.ok); // => true
```

## The checklist

| Field | Rule |
|---|---|
| `name` | A short name with a capital letter, for example `Interval` |
| `is` | It accepts each value of the domain and no other value. Another domain before it in `vex(...)` gets the values that both accept. |
| `ops` | Give each op `params` and `returns`. The interpreter checks the arguments, and the compiler knows the kinds of the values. |
| `laws` | Claim a law only if it is true. Test the claims with `checkLaws` of `@mark1russell7/vex-testkit`. |
| `identity` | Give it to an op with a neutral value, for example 0 for `add`. `reduce` over an empty list gives it. |
| `liftScalar` and `fromScalar` | Give them when a number has an obvious value of the domain, for example the vector (n, n) |
| `valid` | A check of each result. A result that fails it gives `#NUM!`. |
| `show` | A short text of a value, for traces |
| `encode` and `decode` | The JSON form of a value, for a literal in a serialized program |
| `primitive` | Only for a domain of all the numbers, texts or booleans and no other value |
| `samples` | Some values. The compiler gives them to an op and to its copy in a module. |

## A domain for a standalone module

`emitModule` of `@mark1russell7/vex-compiler` copies the text of `is`, `valid` and each op function into the module. Thus:

- Make each op a function (`fn`). A method of a class needs the class, and the module does not have it.
- A function reads only its parameters. A name from outside the function stops the copy.
- Use plain data for the values. A test with `instanceof` reads the name of a class, so the module cannot copy it.
- Give `samples`. The compiler compares each op with its copy on the samples.

`Vec2Domain` uses a class, so a program with vectors operates in the interpreter and in `tiered`, but not in a standalone module.

## Where the domain goes

A domain of one project starts in that project. Test its laws there. When the domain is general, for example a rectangle or an interval, propose it for `@mark1russell7/vex-domains`. Ask the user, then open an issue on `github.com/mark1russell7/vex` with the domain and its tests.
