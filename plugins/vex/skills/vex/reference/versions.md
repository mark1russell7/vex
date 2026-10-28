# Versions

The skill describes the main branch of the repository. A project uses the version that it installed, and the two can differ. Find the installed version first:

```sh
npm ls @mark1russell7/vex @mark1russell7/vex-domains @mark1russell7/vex-compiler
npm view @mark1russell7/vex version
```

A program from a newer version can have a node that an older version does not know. From 0.7.0, the error is `#VALUE!` with the message "the expression has a node with the tag ..., and this version of Vex does not know it". Version 0.6.0 throws a `TypeError` with the message "children is not a function or its return value is not iterable".

## The features of each version

The four packages `vex`, `vex-domains`, `vex-testkit` and `vex-compiler` have one version. The MCP server `vex-mcp` has its own version from 0.14.0. The `CHANGELOG.md` of each package lists the features before 0.6.0.

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
| A standalone module of a tree space: the option `space: "tree"` of `emitModule`, with the move `parent` and the axes of a tree. The input `space` of the tool `vex_module`. | 0.11.2 |
| A standalone module of the formula columns of a sheet: `emitSheetModule`, with the results and the cycles of `SheetRun`. | 0.11.2 |
| The axes of `Vec2Domain`: `along`, `across`, `compose` and `select`, for a main axis and a cross axis, and open bounds with `select` | 0.12.0 |
| Arrays as lists: an array of a field or of a name in a list op and in the axis `list`, and the list ops `indexOf(list, value)` and `fill(n, value)` | 0.12.0 |
| Lists in a standalone module: `drop`, `append`, `without`, `flat`, `get` and `indexOf`, list literals, a list op over a `let`, and lists as names of `iterate` and `fold` | 0.13.1 |
| A standalone module of a graph space: the option `space: "graph"` of `emitModule`, with the edges as positions and the axes of a graph. `reduce` in a module. The input `space: "graph"` of the tool `vex_module`. | 0.13.2 |
| Lists as values in a standalone module: a list as the value of a program, a column of lists in `emitSheetModule` with a `ListKind` in `kinds`, and lists as branches of `if` and `ifError`. The run gives each list as a `vex.list`. | 0.13.3 |
| The option `by` of `sortBy`: the items in the order of the results of an op on their values, also in a standalone module | 0.13.4 |
| The names of a loop over a list: the field `as: [item, index]` of `each` and `fold`, also in a standalone module and in the builder | 0.14.0 |
| `JsonDomain`: the ops `kind`, `kinds`, `fields` and `field` over JSON values | 0.14.0 |
| The list ops `distinct(list)`, `group(list, keys)` and `join(list, sep)`, and the list chain methods `distinct()`, `group(keys)` and `join(sep)` | 0.15.0 |
| `leaves(o, depth)` of `JsonDomain`: the walk of an object as a list of leaves with a path, a kind and a value | 0.15.0 |
| The schema program of JSON documents in `vex-domains`: `SCHEMA_PROGRAM`, `SCHEMA_DOMAINS`, `schemaOf(docs)` and the type `JsonFieldSchema` | the next release |

A feature of the main branch that is not on npm yet has the version "the next release". Until it is on npm, a project can use it only from a local copy of the repository, for example with `pnpm link`. Do not write a workaround for a missing feature without a note. Tell the user which version has it.
