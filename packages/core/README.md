# @mark1russell7/vex

[![npm](https://img.shields.io/npm/v/@mark1russell7/vex)](https://www.npmjs.com/package/@mark1russell7/vex) [![CI](https://github.com/mark1russell7/vex/actions/workflows/ci.yml/badge.svg)](https://github.com/mark1russell7/vex/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@mark1russell7/vex)](https://github.com/mark1russell7/vex/blob/main/LICENSE)

Typed spreadsheet formulas over TypeScript objects. A Vex program evaluates at one record of a collection. It reads fields relative to that record, and combines them with the ops of domains, for example 2D vectors. A failure does not throw: it is an error value with a code like `#REF!` or `#N/A`, and a trace shows where it started.

**[Documentation, live examples and the Lab](https://mark1russell7.github.io/vex/)**

## Install

```sh
npm install @mark1russell7/vex @mark1russell7/vex-domains
```

## Example

The distance from each box to the nearest other box:

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const boxes = space.record({
  A: { position: new Vec2(0, 0) },
  B: { position: new Vec2(3, 4) },
  C: { position: new Vec2(6, 8) },
});
const root = vex(Vec2Domain, NumDomain).over(boxes);
const nearest = root.from("position").others((e) => e._.distance("position")).min();

nearest.at("A");        // => { tag: "some", value: 5 }
nearest.all().values(); // => [5, 5, 5]
nearest.at("A");        // : Optional<number>
```

The types know the fields of the records and the ops of each domain. `root.from("mass")` and `._.explode()` do not compile.

## Features

- **Axes.** `others`, `each`, `neighbors` in a grid, and `children`, `ancestors`, `descendants` and `siblings` in a tree. A `where` test filters the targets.
- **Sheets.** Named columns of formulas that read each other, like the columns of a spreadsheet. A cycle of reads gives `#CYCLE!`.
- **Error values.** Each failure has a code, a kind, a message, the path of its node, the origin and the focus. `ifError` catches an error.
- **Programs are data.** A program is a JSON tree. `explain` gives a trace, `deps` gives the reads, and `compile` gives a program that evaluates at each record of each space.
- **Documents.** A program can also be a document of [coeval](https://github.com/mark1russell7/coeval), the shared form of the languages of the family.
- **No runtime dependencies.** The package is one ES module with its type declarations.

## Documents

`toDocument` gives the document of a program in coeval, and `fromDocument` reads it back. In a document, each term is an envelope `{ type, value }`. A reference is a path from a root: `self` is the record where the program evaluates, and `names` holds the bound names. `compile`, `evaluate`, `explain` and `parse` take a document too.

```ts doctest
import { app, evaluate, fromDocument, lit, ref, space, toDocument } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

const next = app("add", ref("n"), lit(1));
const doc = { type: ["ops", "add"], value: [{ type: "ref", value: ["self", "n"] }, 1] };

toDocument(next);   // => { ok: true, value: doc }
fromDocument(doc);  // => { ok: true, value: next }
evaluate(doc, { space: space.array([{ n: 2 }]), origin: "0", domains: [NumDomain] }); // => { ok: true, value: 3 }
```

A document that is not valid gives the error `#VALUE!` with the reason and the location of the part. The rules are in [the specification](https://github.com/mark1russell7/vex/blob/main/spec/README.md#41-documents).

## Related packages

- [`@mark1russell7/vex-domains`](https://www.npmjs.com/package/@mark1russell7/vex-domains): 2D vectors, colors, angles, numbers and booleans
- [`@mark1russell7/vex-testkit`](https://www.npmjs.com/package/@mark1russell7/vex-testkit): property tests for the laws of your domains
- [`@mark1russell7/vex-compiler`](https://www.npmjs.com/package/@mark1russell7/vex-compiler): generated JavaScript for your programs, with the results of the interpreter

## License

MIT
