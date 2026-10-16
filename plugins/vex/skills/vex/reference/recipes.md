# Recipes

Each recipe is a test of the repository: `pnpm test:docs` starts each block with the meta word `doctest`. A line `// => value` gives the expected value.

## A total over a tree, at each node

A column of a sheet reads itself at the children. Each node gets its own pay plus the totals of its children.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const org = vex(NumDomain).over(space.tree({ ceo: { pay: 300 }, cto: { pay: 200 }, dev: { pay: 100 } }, { cto: "ceo", dev: "cto" }));
const cost = org
  .sheet()
  .declare<{ cost: number }>()
  .column("cost", (r) => r.from("pay")._.add(r.start(0).children(() => r.start(r.cell("cost"))).sum()));

cost.at("ceo", "cost"); // => { tag: "some", value: 600 }
cost.at("cto", "cost"); // => { tag: "some", value: 300 }
```

## A running position in a row

Each item starts after the item before it and a gap. The first item has its own formula, so the column needs no `ifError`.

```ts doctest
import { offset, space, vex } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const items = vex(NumDomain).over(space.array([{ w: 40 }, { w: 10 }, { w: 25 }]));
const row = items
  .sheet()
  .declare<{ left: number }>()
  .column("left", (r) => r.start(r.cell("left", [offset(-1)]))._.add(r.start(0).offset(-1).from("w"))._.add(8))
  .cellFormula("0", "left", (r) => r.start(0));

row.table().map((x) => x.cells.left); // => [{ ok: true, value: 0 }, { ok: true, value: 48 }, { ok: true, value: 66 }]
```

## A lookup by a position from the data

`index` takes a chain: the position comes from a field. This is `INDEX` of a spreadsheet. A position that is not whole, or outside the space, gives `#REF!`.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const people = vex(NumDomain).over(space.array([{ age: 50, boss: 0 }, { age: 30, boss: 0 }, { age: 20, boss: 1 }]));
const bossAge = people.start(0).index(people.from("boss")).from("age");

bossAge.all().values(); // => [50, 50, 30]
```

## A loop over the items in order

`fold` makes one step at each target of an axis, in the order of the axis. The names of the loop keep their values from step to step. This program gives the largest sum of a run of items, from the start of the list.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const gains = vex(NumDomain).over(space.array([{ g: 3 }, { g: -5 }, { g: 4 }, { g: 2 }]));
const best = gains
  .start(0)
  .each((t) => t.from("g"))
  .fold({ sum: 0, best: 0 }, (x, g) => ({ sum: x.sum._.add(g), best: x.best._.max(x.sum._.add(g)) }), (x) => x.best);

best.at("0"); // => { tag: "some", value: 4 }
```

## A loop with a test

`iterate` makes at most `limit` steps. The test `until` stops it. If no test is true after the last step, the result is `#NUM!`.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const sizes = vex(NumDomain).over(space.array([{ n: 5 }, { n: 64 }]));
const power = sizes.start(0).iterate(64, { p: 1 }, (x) => ({ p: x.p._.multiply(2) }), (x) => x.p, { until: (x) => x.p._.gte("n") });

power.all().values(); // => [8, 64]
```

## A fast program

`tiered` of `@mark1russell7/vex-compiler` gives a program with generated JavaScript. Its results are the results of the interpreter.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { tiered } from "@mark1russell7/vex-compiler";
import { NumDomain } from "@mark1russell7/vex-domains";

const rows = space.array([{ v: 4 }, { v: 1 }, { v: 3 }]);
const share = vex(NumDomain).over(rows).from("v")._.divide(vex(NumDomain).over(rows).start(0).each((t) => t.from("v")).sum());
const program = tiered(share.program, { domains: [NumDomain] });

program.tier;                               // => 2
program.run({ space: rows, origin: "0" }); // => { ok: true, value: 0.5 }
```

A program keeps the value of each node that depends only on the space. Thus the sum of the column evaluates once for all the keys.

## A standalone module

`emitModule` prints a program as an ES module without Vex. A build can write the module to a file. The schema gives the kind of each field, and the module checks it.

```ts doctest
import { app, axes, each, ref } from "@mark1russell7/vex";
import { emitModule } from "@mark1russell7/vex-compiler";
import { NumDomain } from "@mark1russell7/vex-domains";

const share = app("divide", ref("v"), app("sum", each(axes.all, ref("v"))));
const m = emitModule(share, { domains: [NumDomain], schema: { fields: { v: "number" } } });

m.ok; // => true
```

## A program as data

A program is JSON. `serialize` gives the text, and `parse` checks the text and gives the program. A literal of a domain needs `encode` and `decode` in its domain.

```ts doctest
import { app, lit, parse, ref, serialize } from "@mark1russell7/vex";
import { Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const moved = app("add", ref("position"), lit(new Vec2(1, 2)));
const text = serialize(moved, [Vec2Domain]);

text.ok;                                                                            // => true
text.ok ? JSON.stringify(parse(text.value, [Vec2Domain])) === JSON.stringify({ ok: true, value: moved }) : false; // => true
```
