---
name: vex
description: Write, review or fix code that calculates values over a collection of records, tree nodes or grid cells with Vex (@mark1russell7/vex). Use it for layouts, spreadsheet formulas, roll-ups over trees, 2D geometry and each project that imports @mark1russell7/vex, vex-domains, vex-compiler or vex-testkit. It tells which domains and ops exist, which mistakes to avoid, when to make a new domain and how to report a gap in Vex.
---

# Vex

Vex is a TypeScript library for typed spreadsheet formulas over records. A program evaluates at one key of a space. It reads fields relative to that key, applies the ops of domains, and gives a value or an error value. It does not throw.

## Before you write a program

1. Find the installed version: `npm ls @mark1russell7/vex @mark1russell7/vex-domains`. Some features need a newer version. Refer to [versions](reference/versions.md).
2. Read the [catalog](reference/catalog.md) of the domains and their ops. Do not write a host function for math that an op does.
3. Find the shape of the data: named items, a list, a grid, a tree or a graph. Each shape is a space.
4. Write the math once, for one item. Then evaluate it at each key.
5. Look for a [recipe](reference/recipes.md) of the same task.
6. Test the program on sample records with the MCP tools of the plugin before you write it into the code. `vex_evaluate` gives the value or the error at each key, and `vex_explain` gives the trace.

## The MCP tools

| Tool | What it gives |
|---|---|
| `vex_catalog` | The catalog of the domains, or the section of one domain |
| `vex_check` | The size, the nesting and the reads of a program, and if the compiler gives it generated code |
| `vex_evaluate` | The value or the error at each key of a space of records |
| `vex_explain` | The trace at one key: each node, with its focus, its reads and its result |
| `vex_module` | The source of a standalone ES module, or the reason that the program cannot be one |

A program is the JSON form of the IR. A value of a domain has the form `{ "$vex": "domain", "domain": "Vec2", "value": [1, 2] }`, in the program, in the records and in the results.

## The model

| Term | Meaning |
|---|---|
| space | The records and their keys: `space.record`, `space.array`, `space.grid`, `space.tree` or `space.graph`. A space does not change. |
| origin | The key where the evaluation starts |
| focus | The key where a field reference reads. A move changes the focus. Inside an axis, the focus is the target. |
| address | A list of moves from the focus: `key`, `index`, `offset`, `other`, `origin` and `parent` |
| axis | A relation from the focus to target keys: `all`, `others`, `neighbors`, `window`, `children`, `where` and more. It gives a list. |
| domain | A kind of value and its ops. The first domain whose `is` accepts the receiver gives the op. |
| result | A `Result` (`ok` or an error) or an `Optional` (`some` or `none`). An error has a code like `#REF!` and a message. |

The distance from each box to the nearest other box:

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const boxes = space.record({ A: { position: new Vec2(0, 0) }, B: { position: new Vec2(3, 4) }, C: { position: new Vec2(6, 8) } });
const root = vex(Vec2Domain, NumDomain).over(boxes);
const nearest = root.from("position").others((e) => e._.distance("position")).min();

nearest.at("A");        // => { tag: "some", value: 5 }
nearest.all().values(); // => [5, 5, 5]
```

`root.from("position")` reads the field at the origin. Inside `others`, the field name `"position"` reads at each other box. `min()` reduces the list.

## The rules

1. Calculate a value for x and y once, with one `Vec2`. `vec2` makes a vector, and `x` and `y` read it.
2. A list reduction `sum`, `mean`, `min` or `max` takes only numbers. Use `reduce("max")` for vectors and other domain values.
3. In the builder, a bare text argument is the name of a field. Use `root.lit("text")` for a text value.
4. Put each domain of the program in `vex(...)`. The first domain whose `is` accepts a value gives its ops.
5. Inside an axis, a field name reads at each target. A value from before the axis keeps its value.
6. A reduction skips the error items. Give `{ strict: true }` to get the first error.
7. Use `ifError(fallback)` only for an error that you expect. An unexpected error tells you about a defect in the data.
8. A program is JSON data. Use `serialize` and `parse` to keep it or send it. Follow `ir.schema.json` to write it by hand.
9. Do not copy the math of a program into TypeScript. One program is the source of truth, and `explain` shows each step.
10. For speed, compile the program with `tiered` of `@mark1russell7/vex-compiler`. It gives the results of the interpreter.

## Two dimensions in one value

When the math of the width and the height is the same, write it once:

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const items = vex(NumDomain, Vec2Domain).over(space.array([{ w: 10, h: 20 }, { w: 30, h: 5 }]));
// The cell: the component-wise maximum of the sizes, at least 1 by 1. max(1) lifts 1 to the vector (1, 1).
const cell = items.start(0).each((t) => t.from("w")._.vec2(t.from("h"))).reduce("max")._.max(1);
// The corner of the item in column 1 and row 0: (1, 0) times the cell and a gap of 10.
const corner = items.start(1)._.vec2(0)._.multiply(cell._.add(10));

cell.at("0");          // => { tag: "some", value: new Vec2(30, 20) }
corner._.x().at("0"); // => { tag: "some", value: 40 }
```

For a standalone module, use `XYDomain` and the op `xy` instead: their vectors are plain `{ x, y }` data. Refer to [make a domain](reference/domains.md#a-domain-for-a-standalone-module).

## The IR

The builder makes an expression: a tree of plain data. Code can make the same tree with the functions of `@mark1russell7/vex`.

| Function | Node |
|---|---|
| `lit(value)` | A literal |
| `ref(path, at?)` | The field at `path`, in the record at the address `at` |
| `app(op, ...args)` | An op. The first argument is the receiver. `if`, `and`, `or` and `ifError` are `app` nodes too. |
| `let_(bind, body)` and `v(name)` | Names and their values |
| `rec(fields)` | A record of values |
| `each(axis, body, at?)` | A list: `body` at each target of `axis` |
| `fold(axis, init, step, result, at?)` | A loop over the targets of `axis`, in order |
| `iterate(limit, init, step, result, until?)` | A loop of at most `limit` steps |
| `ext(kind, data)` | The value of an extension handler |

The moves are `key(k)`, `index(i)`, `offset(...d)`, `other`, `origin` and `parent`. `key` and `index` also take an expression. The axes are in `axes`, for example `axes.all`, `axes.others`, `axes.window(from, to)`, `axes.reverse(axis)` and `axes.where(axis, test)`. In the builder, the option `reverse: true` of an axis gives the reverse order.

```ts doctest
import { app, axes, each, evaluate, lit, ref, space } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const sizes = space.array([{ size: new Vec2(10, 20) }, { size: new Vec2(30, 5) }]);
const cell = app("max", app("reduce", each(axes.all, ref("size")), lit("max")), lit(1));

evaluate(cell, { space: sizes, origin: "0", domains: [NumDomain, Vec2Domain] }); // => { ok: true, value: new Vec2(30, 20) }
```

## Make Vex better

Vex grows when its users find what it lacks. Each program that you write is a test of the theory.

**Make a new domain** when a value has its own ops. These are the signs:

- Two or more numbers move together: a size, a point, a range, a color.
- A value has a unit or a rule: money with a currency, an angle, a date, a percentage.
- The same group of operations on a value repeats in different places.
- An operation obeys a law (commutative, associative, idempotent), so a reduction can use it.

Refer to [make a domain](reference/domains.md). A domain of one project starts in that project. When it is general, propose it for `@mark1russell7/vex-domains`.

**Report a gap** when Vex cannot express a calculation, or when an op is missing. Do not hide the gap behind a host function or an extension without a report.

1. Write the smallest program that shows the gap, and the workaround that you used.
2. Ask the user, then open an issue on `github.com/mark1russell7/vex` with the title `Gap: <what is missing>`.
3. Tell the user about the gap in your report.

## Read more

- The site: `https://mark1russell7.github.io/vex/`, with the tour, the concepts, the axes, sheets, vectors and the Lab
- The specification: `spec/README.md` of the repository. Each rule has a requirement ID and a test.
- The compiler: `docs/COMPILER.md` of the repository
- [The catalog](reference/catalog.md), [the recipes](reference/recipes.md), [make a domain](reference/domains.md) and [the versions](reference/versions.md)
