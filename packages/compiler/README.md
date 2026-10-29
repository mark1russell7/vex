# @mark1russell7/vex-compiler

[![npm](https://img.shields.io/npm/v/@mark1russell7/vex-compiler)](https://www.npmjs.com/package/@mark1russell7/vex-compiler) [![license](https://img.shields.io/npm/l/@mark1russell7/vex-compiler)](https://github.com/mark1russell7/vex/blob/main/LICENSE)

The compiler of [Vex](https://mark1russell7.github.io/vex/), the typed spreadsheet formulas over TypeScript objects. It turns a Vex program into JavaScript source, and the result of each run is the result of the interpreter.

## Install

```sh
npm install @mark1russell7/vex @mark1russell7/vex-compiler
```

## Example

The distance from each box to the nearest other box. `tiered` gives a program with the interface of `compile`.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { tiered } from "@mark1russell7/vex-compiler";
import { Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const root = vex(Vec2Domain).over(space.record({ A: { position: new Vec2(0, 0) }, B: { position: new Vec2(3, 4) } }));
const nearest = root.from("position").others((e) => e._.subtract("position")._.length()).min();
const program = tiered(nearest.program, { domains: [Vec2Domain] });
program.tier; // => 2
program.run({ space: root.space, origin: "A" }); // => { ok: true, value: 5 }
```

## The tiers

| Tier | What | When |
|---|---|---|
| 1 | The closure compiler of the core (`compile`) | The fallback, each trace, and each page without `new Function` |
| 2 | Generated JavaScript, made with `new Function` | Each other run |

The generated code expects the usual case. A check guards each fact that it expects: each field exists, each value has the expected kind, and no op fails. When a check fails, tier 1 does that run again. Thus each error value comes from the interpreter, with its message and its location.

A list op skips an error item, as the interpreter does, and `ifError` gives its second argument. These cases stay in tier 2.

`program.stats` counts the runs and the fallbacks. `program.reason` tells why a program has no generated code.

## The same results

Property P17 compares `tiered` with `evaluate` on random programs, random spaces and the programs of the builder. The property also measures the share of the values that tier 2 gives. Thus a fallback cannot hide a gap.

These cases operate in tier 1:

- A list value with an error item, because generated code makes no error values.
- A list op on a list value from a binding or a variable. A list op over an axis is one loop in tier 2.
- An error of an extension, and each exception that is not an error of an op.

A program keeps the value of each node that depends only on the space, for each space (COMPILE.MEMO). Thus a run at each key of a space computes such a node once, for example a total of a column. A node that reads the origin only through a few values, its keys, has an entry for each value of its keys (COMPILE.GROUP). Thus "the largest width in the column of the origin" evaluates once for each column. A space does not change, so the values stay correct.

The compiler reads the op tables of the domains when it loads a program. A program keeps the method of each op site for the next receiver. A property read of the receiver must give the same function, so a getter that gives the method is not a method.

## Safety

The source has no name and no literal of the program. It reads each one from a list of constants, by its index. The same program always gives the same source.

## API

| Function | What it does |
|---|---|
| `tiered(expr, options)` | A program of tier 2 if it can, and else of tier 1 |
| `generate(expr, options)` | The loop IR and the source of a program for the options, or the reason that it has none |
| `load(generated)` | The function of tier 2. It gives the value, or `FALLBACK`. |
| `emitModule(expr, options)` | The source of a standalone ES module of a program over an array or a tree, or the reason that it has none |
| `emitSheetModule(columns, options)` | The source of a standalone ES module of the formula columns of a sheet, with the results of `SheetRun` |

`tiered`, `generate` and `emitModule` take an expression or a document of coeval, as `toDocument` of `@mark1russell7/vex` gives it.

### The options of a module

`emitModule` and `emitSheetModule` take these options:

| Option | What it does |
|---|---|
| `schema` | The kinds of the fields of the records and of the variables. A field can have a `ListKind`. |
| `domains` | The domains of the ops of the program |
| `name` | The name of the function of the module. The default is `run`. |
| `space` | `"array"`, `"tree"` or `"graph"`. The default is `"array"`. |
| `fuse` | `false` prints the code without the fusion of the list ops. The default is `true`. |
| `lists` | `"envelope"` gives each list of the input and of the result as a `vex.list`. `"plain"` gives plain arrays of the values, with `VEX_ERROR` for an error item. The default is `"envelope"`. |

`emitSheetModule` also takes `cells`, `kinds` and `budget`.

With `lists: "plain"`, the key of an item of the input is the text of its position, and the result has no keys. A list in a record or in an argument of an op stays a `vex.list`. The module prints no types, so the host declares `T[]` for a list of `T`.

## Speed

The speed gate compares tier 2 with hand-written loops. On 2026-10-13, the nearest other box was 1.0 to 1.1 times the loops, and the Game of Life was 1.05 to 1.13 times. Tier 1 was 80 and 120 times. The plan of the compiler is in [`docs/COMPILER.md`](https://github.com/mark1russell7/vex/blob/main/docs/COMPILER.md).

## License

MIT
