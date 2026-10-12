# The Vex language, version 1.0

This document is the specification of Vex 1.0. Each normative statement has a requirement ID in square brackets, for example `[EVAL.TOTAL]`. Each requirement ID has at least one test that names it. The test `spec-coverage.test.ts` makes CI fail when an ID has no test, or when a test names an ID that this document does not define.

The design and the reasons for it are in [`docs/REVIEW.md`](../docs/REVIEW.md). The v0.9 specification is in [`docs/archive/spec-v0.9.md`](../docs/archive/spec-v0.9.md).

## 1. Model

A Vex program is an expression. It evaluates at one key of a space. The key where it starts is the origin. The key where relative references read is the focus. At the start, the focus is the origin.

| Term | Meaning |
|---|---|
| space | An immutable collection of records with keys: a record space, an array space or a grid space |
| origin | The key where an evaluation starts |
| focus | The key where a reference without an address reads |
| address | A list of moves from the focus |
| axis | A relation between the focus and a list of target keys |
| domain | A set of values and the ops on them |
| result | A value, or an error value with a code |

## 2. Spaces

- A record space has the property names of an object as keys, in their order.
- An array space has the keys `"0"`, `"1"` and so on.
- A grid space has the key `"row,column"` for each cell. A row can be shorter than the others.
- **[SPACE.TREE]** A tree space has records by key, and a parent for each key that is not a root. A parent that is not a key, or a cycle of parents, makes the constructor throw. The children of a key are in key order.
- A space copies its input. A later change to the input does not change the space.

## 3. Addresses

A move changes the key where a reference reads.

- **[NAV.KEY]** The move `key(k)` goes to the key `k`. If the space has no key `k`, the result is the error `#REF!`.
- **[NAV.INDEX]** The move `index(i)` goes to the key at position `i` in the key order. A position outside the keys gives `#REF!`.
- **[NAV.OTHER.PAIR]** The move `other` goes to the other key of a space with two keys. In a space with a different number of keys, it gives `#REF!`.
- **[NAV.OFFSET]** The move `offset(d)` adds `d` to the position of the focus: one number in an array space, two numbers in a grid space. A position outside the space, or an offset in a record space, gives `#REF!`.
- **[NAV.OFFSET.TREE]** In a tree space, the move `offset(d)` with one number goes to the sibling at distance `d` in key order. The roots are the siblings of a root. A position outside the siblings gives `#REF!`.
- **[NAV.ORIGIN]** The move `origin` goes back to the origin of the evaluation.
- **[NAV.PARENT]** The move `parent` goes to the parent of the focus in a tree space. A root gives `#REF!`, and a space that is not a tree gives `#REF!`.
- **[NAV.SEQUENCE]** The moves of an address apply in order. If one move fails, the address fails. Vex does not simplify addresses, because a simplification could hide a failure.

## 4. Expressions

An expression is plain JSON data. It has one of these kinds.

| Kind | Fields | Value |
|---|---|---|
| `lit` | `value` | the value |
| `ref` | `path`, `at` | the field at the path, in the record at the address |
| `app` | `op`, `args` | the op applied to the values of the arguments |
| `let` | `bind`, `body` | the body, with names bound to the values of the bindings |
| `var` | `name` | the value of a bound name |
| `rec` | `fields` | a record of the values of the fields |
| `each` | `axis`, `body`, `at` | a list: the body at each target of the axis, from the key of the address |
| `ext` | `kind`, `data` | the value of an extension handler |

- **[IR.JSON]** An expression gives the same expression after `serialize` and `parse`, if each literal is JSON data or a value of a domain. A domain value needs `encode` and `decode` in its domain. A domain value can be in a list or a record of a literal.
- **[IR.JSON.NUMBER]** A literal number that JSON has no text for (`-0`, `NaN`, `Infinity` or `-Infinity`) gets the form `{ "$vex": "number", "value": text }`.
- **[IR.JSON.ESCAPE]** A record of a literal with the key `$vex` gets the form `{ "$vex": "escape", "value": record }`. Thus `parse` does not read data as a domain value. A record with another form of `$vex` stays data.

## 5. Evaluation

- **[EVAL.TOTAL]** The interpreter does not throw. It gives a value or an error value. A value is not `undefined`.
- **[EVAL.PURE]** An evaluation does not change any state. Two evaluations of the same expression at the same key give the same result.
- **[EVAL.ORIGIN]** An origin that is not a key of the space gives `#REF!`.
- **[EVAL.LOCATION]** An error value has the path of the node that made it, and the origin and the focus of the evaluation at that node. An extension handler can give an error without an origin. Then the interpreter adds the path, the origin and the focus of the extension node.
- **[EVAL.COMPILE]** `compile(e, options)` gives a program. Its `run` and `explain` give the same results and the same traces as `evaluate` and `explain`. One program evaluates at each origin of each space, and one evaluation does not change a later evaluation.
- **[EVAL.REFERENCE]** The interpreter of `@mark1russell7/vex` and the reference interpreter of `@mark1russell7/vex-testkit` give the same value or the same error code.

### 5.1 References

- **[REF.FOCUS]** A reference without an address reads the field at the focus.
- **[REF.PATH]** A path with more than one segment reads nested fields. The empty path reads the whole record.
- **[REF.MISSING]** A missing field, or a field with the value `null`, gives `#N/A`.
- **[REF.FORBIDDEN]** The segments `__proto__`, `constructor` and `prototype` are not fields. They give `#N/A`.
- **[REF.ADDRESS]** A reference with an address reads at the key where the address points. A failed address gives `#REF!`.

### 5.2 Ops

- **[CALL.METHOD]** For an op without `fn`, the interpreter calls the method of the receiver with the same name.
- **[CALL.FN]** For an op with `fn`, the interpreter calls `fn` with the receiver and the other arguments.
- **[CALL.UNKNOWN-OP]** An op that the domain of the receiver does not declare gives `#NAME?`. An inherited member, for example `toString`, is not an op.
- **[CALL.RECEIVER]** A receiver that no domain accepts gives `#VALUE!`, if no free function has the name of the op.
- **[CALL.FREE]** A free function applies when no domain accepts the receiver.
- **[CALL.PARAMS]** If an op declares the kinds of its parameters, an argument of the wrong kind gives `#VALUE!`.
- **[CALL.LIFT]** If an op declares `liftScalar`, the interpreter changes each number argument into a domain value with `fromScalar`.
- **[CALL.THROW]** An op that throws gives `#CALC!`. The error keeps the thrown value.
- **[CALL.RESULT]** An op result that is `undefined` or `null` gives `#CALC!`. A number that is not finite, or a domain value that fails the `valid` check of its domain, gives `#NUM!`.
- **[CALL.ARGS]** The interpreter evaluates all arguments. One failed argument gives its own error. Two or more failed arguments give `#ARGS`, with each error as a cause.
- **[CALL.STRING-ARGS]** A string literal is a value. The builder makes a field reference only from a bare string.

### 5.3 Bindings and records

- **[LET.BIND]** `let` binds each name to the value of its binding, for the body.
- **[LET.LAZY-ERROR]** A binding that fails has an effect only where a `var` reads it.
- **[LET.UNBOUND]** A name without a binding gives `#NAME?`.
- **[LET.VARS]** The caller of the interpreter can give variables.
- **[REC.FIELDS]** `rec` makes a record of its fields. Two or more failed fields give `#ARGS`.

### 5.4 Axes

- **[AXIS.ALL]** The axis `all` has each key of the space as a target.
- **[AXIS.OTHERS]** The axis `others` has each key except the focus as a target.
- **[AXIS.OTHERS.ORIGIN]** Inside an axis, the focus is the target, and the origin does not change. A value bound outside the axis keeps its value. Thus a base value from the origin and a field of the target can meet in one body.
- **[AXIS.OTHER.PAIR]** The axis `other` has the other key of a pair as a target. Outside a pair, it gives `#REF!`.
- **[AXIS.NEIGHBORS]** The axis `neighbors(4)` or `neighbors(8)` has the neighbor cells of the focus in a grid as targets. Outside a grid, it gives `#REF!`.
- **[AXIS.TREE]** In a tree space, the axis `children` has the children of the focus as targets, in key order. `ancestors` has the parent first and the root last. `descendants` has each key under the focus, depth first, with each parent before its children. `siblings` has the other children of the parent, or the other roots for a root. In a space that is not a tree, each of these axes gives `#REF!`.
- **[AXIS.WHERE]** The axis `where(axis, test)` keeps the targets of `axis` where `test` gives `true`. A test that fails, or that does not give a boolean, gives an error item for that target.
- **[AXIS.OTHERS-UNION]** The targets of `others` and the focus are the targets of `all`.
- **[AXIS.OTHER-TWICE]** In a pair, the address `[other, other]` points to the focus.
- **[AXIS.ADDRESS]** An axis with an address finds its targets from the key where the address points, not from the focus. A failed address gives `#REF!`. Inside the body, the focus is the target, and the origin does not change.
- **[AXIS.ADDRESS-EXTEND]** Let `k` be the key of the address. For a body that does not read the origin, the axis gives the same list as the axis at origin `k`.
- **[AXIS.EXTEND]** For an expression that does not read the origin, the item at key `k` of `each(all, e)` equals `e` evaluated at origin `k`. This is the law of a comonad: extract after extend gives the program.

### 5.5 Lists

- **[LIST.LENIENT]** A list op skips error items by default. With `{ strict: true }`, the first error item is the result.
- **[LIST.EMPTY]** `min`, `max`, `mean` and `first` of an empty list give `#N/A`. `sum` gives 0 and `count` gives 0. `reduce` gives the identity of the op, or `#N/A` if the op has no identity.
- **[LIST.KINDS]** `sum`, `mean`, `min` and `max` need numbers. `any`, `all` and `none` need booleans. A value of another kind gives `#VALUE!`.
- **[LIST.REDUCE]** `reduce` folds the values from the left with a domain op. For an associative op, any order of reduction gives the same value.

### 5.6 Special forms

- **[FORM.IF]** `if` evaluates only the branch that its condition selects. A condition that is not a boolean gives `#VALUE!`.
- **[FORM.AND-OR]** `and` and `or` stop at the first argument that decides the result.
- **[FORM.IFERROR]** `ifError` gives its first argument, or its second argument when the first is an error.

## 6. Folds

- **[TRACE.EVENTS]** `explain` records one event for each node evaluation, in the order that the nodes finish. A reference event records its reads.
- **[TRACE.AXIS]** Inside an axis, the focus of each event is the target.
- **[DEPS.READS]** `deps` gives each reference of an expression, with its address, the axes around it and the address of each axis.

## 7. Domains

- **[DOMAIN.OWNED]** A domain owns its op table. `defineDomain` does not change a class or a prototype, and an import has no side effects.
- **[DOMAIN.LAWS]** Each law that a domain declares holds for the values of the domain. `@mark1russell7/vex-testkit` checks each law with property tests.

## 8. The builder

- **[BUILD.IMMUTABLE]** A builder call gives a new chain. An earlier chain does not change.
- **[BUILD.AXIS.ADDRESS]** The moves before an axis are the address of the axis. Thus `parent().children(f)` evaluates `f` at each child of the parent.
- **[BUILD.LIST.KEYS]** A list chain has `keys()` and `errors()`. `keys()` gives the keys of the items with a value, in the order of the axis. `errors()` gives the error of each item that failed.
- **[BUILD.CALL]** `call(name, ...args)` applies a free function of `withOptions`: the expression is `app(name, value, ...args)`. A domain op with the same name for the value comes first at run time.
- **[TYPE.FROM]** `from(p)` accepts only the fields of the record type, and the chain value has the type of the field.
- **[TYPE.OPS]** `._` has only the ops of the domain of the current value, with the parameter types of each op.
- **[TYPE.LIFT]** A number argument for a domain parameter needs `liftScalar` on the op.
- **[TYPE.STATE]** After an op gives a value that no domain of the chain accepts, the chain has no `._`.
- **[TYPE.OTHER]** `other()` exists only on a chain over a space with two keys, or with keys that the compiler does not know.
- **[TYPE.KEYS]** Evaluation accepts only the keys of the space.
- **[TYPE.LIST]** A number reduction needs a list of numbers.
- **[TYPE.NO-ANY]** No value type of the builder is `any`.
- **[TYPE.CALL]** `call` accepts only the names of the free functions whose first parameter accepts the current value. The other arguments have the types of the other parameters, and the chain value has the return type of the function.

## 9. Sheets

A sheet has named columns of formulas over a space. A cell is one column at one key. A formula reads a cell with a cell reference: the extension node `ext("vex.cell", { column, at })`.

- **[SHEET.CELL]** A cell reference resolves its address from the focus, then gives the result of that cell. An unknown column gives `#NAME?`, and an address outside the space gives `#REF!`.
- **[SHEET.RECURRENCE]** A column can read itself at another key. A recurrence over the key order, for example a running total, gives the same result as a loop.
- **[SHEET.DECLARE]** `declare<T>()` gives the types of columns before their formulas. A formula can read a declared column with its type, also the column itself or a later column. The formula of a declared column must give a value of the declared type. `declare` has no effect at run time.
- **[SHEET.CYCLE]** Each cell on a cycle of cell references gives `#CYCLE!`. A cycle can contain one cell, or cells at different keys.
- **[SHEET.ORDER]** The result of a cell does not depend on the order of the evaluations. `ifError` does not hide a cycle from the cells on that cycle.

## 10. Examples

- **[EXAMPLE.SEPARATION]** The test is `position + size - other.position` in a pair of boxes. A component that is not positive shows that the box at the origin ends before the other box starts.
- **[EXAMPLE.NEAREST]** The minimum of the distances from the origin to the others is the distance to the nearest other record.
- **[EXAMPLE.OFFSETS]** The reduction with `add` of the offsets from the origin to the others is the sum of the offsets.
- **[EXAMPLE.TREE]** In a tree of people, the salary of a person plus the sum over `descendants` is the cost of the team of that person. The `count` over `ancestors` is the depth of the person.
