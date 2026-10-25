# Versions

The skill describes the main branch of the repository. A project uses the version that it installed, and the two can differ. Find the installed version first:

```sh
npm ls @mark1russell7/vex @mark1russell7/vex-domains @mark1russell7/vex-compiler
npm view @mark1russell7/vex version
```

A program from a newer version can have a node that an older version does not know. From 0.7.0, the error is `#VALUE!` with the message "the expression has a node with the tag ..., and this version of Vex does not know it". Version 0.6.0 throws a `TypeError` with the message "children is not a function or its return value is not iterable".

## The features of each version

The five packages have one version. The `CHANGELOG.md` of each package lists the features before 0.6.0.

| Feature | Version |
|---|---|
| A space of a graph, the axes `window` and `table`, a cell with its own formula | 0.6.0 |
| The compiler `@mark1russell7/vex-compiler`: `tiered`, `generate` and `emitModule` | 0.7.0 |
| The loops `fold` and `iterate` | 0.7.0 |
| `key` and `index` with an expression (a lookup by a position from the data) | 0.7.0 |
| `vec2`, `x` and `y` for vectors, and `min` and `max` of `NDVector` | 0.7.0 |
| `XYDomain` and `xy`: vectors as plain data, for a standalone module | 0.7.0 |
| `returns: "domain:Name"`: an op that gives a value of another domain | 0.7.0 |
| The axis `reverse(axis)` and the option `reverse` of an axis | 0.8.0 |
| Functions: `fn` as a binding of `let`, and `call`. In the builder: `root.fn` and `functions` | 0.8.0 |
| Lists as values: the axis `list(expr)`, and `sortBy`, `take` and `nth`, also on a list chain of the builder | 0.8.0 |
| `sin`, `cos`, `asin` and `hypot` of `NumDomain` | 0.7.0 |
| The kinds of domains and ops: `primitive`, `returns` and `samples` | 0.7.0 |
| `SheetRun` with the option `compile`, and `SheetRun.fill` | 0.7.0 |
| `shapeError`, and `#VALUE!` for a node that the version does not know | 0.7.0 |
| Documents of coeval: `toDocument`, `fromDocument` and `isDocument`, and a document in `compile`, `evaluate`, `explain`, `parse` and the compiler | 0.9.1 |
| coeval is the core: the kernel checks the documents by the contracts of `VEX_WORLD`, `deps` uses its static kit, and `kernelPlan` is the reference tier, with `reference` and `agree`. A computed key or position of a document can be a bare literal. `@mark1russell7/coeval` is a runtime dependency. | 0.10.0 |
| List ops that build lists: `drop`, `append`, `without` and `flat`, also on a list chain of the builder, and an axis body that gives a list chain | 0.10.0 |
| Lists as the state of a loop: a list as a name of `iterate` and `fold`, `get(list, key)`, list literals, and in the builder `root.list(items)`, `get(key)` and the names of loops that are list chains | 0.11.0 |

A feature of the main branch that is not on npm yet has the version "the next release". Until it is on npm, a project can use it only from a local copy of the repository, for example with `pnpm link`. Do not write a workaround for a missing feature without a note. Tell the user which version has it.
