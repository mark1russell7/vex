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

A module of a tree takes the option `space: "tree"` (from 0.11.2). Its run takes the parents after the variables: the position of the parent of each record, or -1 for a root. The module has the move `parent` and the axes of a tree.

A module of a graph takes the option `space: "graph"` (from 0.13.2). Its run takes the edges after the variables: for each record, an array of the positions of the ends of its edges. The module has the axes of a graph and `reduce`. A module cannot copy the methods of `Vec2Domain`, so use `XYDomain` in a module.

```ts doctest
import { app, axes, each, ref } from "@mark1russell7/vex";
import { emitModule } from "@mark1russell7/vex-compiler";
import { NumDomain } from "@mark1russell7/vex-domains";

// The cost of the team of each person: the salary plus the salaries of the persons under the person.
const team = app("add", ref("salary"), app("sum", each(axes.descendants, ref("salary"))));
const m = emitModule(team, { domains: [NumDomain], schema: { fields: { salary: "number" } }, space: "tree" });

m.ok && m.source.includes("export function run(records, vars, parents)"); // => true
```

A host gives the records in an array, and the parents in an array of the same length: `run([{ salary: 10 }, { salary: 5 }], {}, [-1, 0])` gives the values 15 and 5.

`emitSheetModule` prints the formula columns of a sheet as a module (from 0.11.2). A column that a formula reads before its formula needs its kind in `kinds`. This column reads itself, so it needs its kind.

```ts doctest
import { app, axes, cell, each, ref } from "@mark1russell7/vex";
import { emitSheetModule } from "@mark1russell7/vex-compiler";
import { NumDomain } from "@mark1russell7/vex-domains";

// The cost of each node: its own pay plus the costs of its children.
const columns = new Map([["cost", app("add", ref("pay"), app("sum", each(axes.children, cell("cost"))))]]);
const m = emitSheetModule(columns, { domains: [NumDomain], schema: { fields: { pay: "number" } }, space: "tree", kinds: { cost: "number" } });

m.ok; // => true
```

The run gives an array for each column: `run([{ pay: 300 }, { pay: 200 }, { pay: 100 }], {}, [-1, 0, 1])` gives `{ cost: [600, 300, 100] }`. A cell on a cycle gives `VEX_ERROR`, as `#CYCLE!` of `SheetRun`.

A cell can hold a list (from the next release). A later formula reads the list with the list ops. A column of lists that reads itself needs a `ListKind` in `kinds`, for example `{ list: "number" }`.

```ts doctest
import { app, axes, cell, each, ref } from "@mark1russell7/vex";
import { emitSheetModule } from "@mark1russell7/vex-compiler";
import { NumDomain } from "@mark1russell7/vex-domains";

// The pay of each node and of each node under it, as a list. Then the largest pay of each subtree.
const columns = new Map([
  ["pays", app("append", each(axes.window(0, 0), ref("pay")), app("flat", each(axes.children, cell("pays"))))],
  ["top", app("max", cell("pays"))],
]);
const m = emitSheetModule(columns, { domains: [NumDomain], schema: { fields: { pay: "number" } }, space: "tree", kinds: { pays: { list: "number" } } });

m.ok; // => true
```

The run gives each list as a `vex.list`, with the keys as text. An error item has the error `VEX_ERROR`. The value of a program in `emitModule` can be a list too.

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

The languages of the family share one form: the documents of [coeval](https://github.com/mark1russell7/coeval). `toDocument` gives the document of a program, and `fromDocument` reads it back. Each term is an envelope `{ type, value }`. A reference is a path from `self` (the record where the program evaluates) or from `names` (a bound name). `compile`, `evaluate`, `explain`, `parse` and the compiler take a document too.

```ts doctest
import { app, axes, each, fromDocument, ref, toDocument } from "@mark1russell7/vex";

const total = app("sum", each(axes.others, ref("size")));
const doc = toDocument(total);

doc; // => { ok: true, value: { type: ["ops", "sum"], value: [{ type: "each", value: { axis: { type: ["axes", "others"], value: {} }, body: { type: "ref", value: ["self", "size"] } } }] } }
fromDocument(doc.ok ? doc.value : null); // => { ok: true, value: total }
```

The kernel of coeval is the core of Vex. Its static kit checks a document by the contracts of `VEX_WORLD` before `fromDocument` reads it. The error of a bad document has the JSON Pointer of the bad part. `kernelPlan` evaluates a document in the kernel: it is the reference tier, and the other tiers give its results. Use it to check a host of coeval against Vex. `agree(options, tier)` of a plan compares the tiers of the kernel with your tier.

```ts doctest
import { app, kernelPlan, ref, space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

kernelPlan(app("add", ref("n"), ref("n")), { domains: [NumDomain] }).run({ space: space.array([{ n: 3 }]), origin: "0" }); // => { ok: true, value: 6 }
```
