# Versions

The skill describes the main branch of the repository. A project uses the version that it installed, and the two can differ. Find the installed version first:

```sh
npm ls @mark1russell7/vex @mark1russell7/vex-domains @mark1russell7/vex-compiler
npm view @mark1russell7/vex version
```

A program from a newer version can have a node that an older version does not know. From 0.7.0, the error is `#VALUE!` with the message "the expression has a node with the tag ..., and this version of Vex does not know it". Version 0.6.0 throws a `TypeError` with the message "children is not a function or its return value is not iterable".

## The features of each version

The four packages have one version. The `CHANGELOG.md` of each package lists the features before 0.6.0.

| Feature | Version |
|---|---|
| A space of a graph, the axes `window` and `table`, a cell with its own formula | 0.6.0 |
| The compiler `@mark1russell7/vex-compiler`: `tiered`, `generate` and `emitModule` | 0.7.0 |
| The loops `fold` and `iterate` | 0.7.0 |
| `key` and `index` with an expression (a lookup by a position from the data) | 0.7.0 |
| `vec2`, `x` and `y` for vectors, and `min` and `max` of `NDVector` | 0.7.0 |
| `XYDomain` and `xy`: vectors as plain data, for a standalone module | 0.7.0 |
| `returns: "domain:Name"`: an op that gives a value of another domain | 0.7.0 |
| `sin`, `cos`, `asin` and `hypot` of `NumDomain` | 0.7.0 |
| The kinds of domains and ops: `primitive`, `returns` and `samples` | 0.7.0 |
| `SheetRun` with the option `compile`, and `SheetRun.fill` | 0.7.0 |
| `shapeError`, and `#VALUE!` for a node that the version does not know | 0.7.0 |

Version 0.7.0 is the next release. Until it is on npm, a project can use a feature of 0.7.0 only from a local copy of the repository, for example with `pnpm link`. Do not write a workaround for a missing feature without a note. Tell the user which version has it.
