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
- **[SPACE.GRAPH]** A graph space has records by key, and the edges from each key, in order. A graph can have cycles, and an edge can go from a key to itself. A second edge to the same key is the same edge. An edge to a key that is not in the graph makes the constructor throw.
- **[SPACE.RECORDS]** Each space that `space` makes has `records`, a frozen list of its records in the order of `keys`. For each key, the record at its index is the record that `get` gives.
- A space copies its input. A later change to the input does not change the space.

## 3. Addresses

A move changes the key where a reference reads.

- **[NAV.KEY]** The move `key(k)` goes to the key `k`. If the space has no key `k`, the result is the error `#REF!`.
- **[NAV.INDEX]** The move `index(i)` goes to the key at position `i` in the key order. A position outside the keys gives `#REF!`.
- **[NAV.COMPUTED]** The key of `key` and the position of `index` can be an expression. These expressions evaluate first, in order, at the position of the node of the address. The first error is the result. A key that is not a text, or a position that is not a number, gives `#VALUE!`. Then the moves apply.
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
| `each` | `axis`, `body`, `at`, `as` | a list: the body at each target of the axis, from the key of the address |
| `fold` | `axis`, `init`, `step`, `result`, `at`, `as` | the result, after a step at each target of the axis |
| `iterate` | `limit`, `init`, `step`, `until`, `result` | the result, after the steps |
| `fix` | `name`, `join`, `init`, `step` | the row of the focus, after the rounds of a column (FIX.ROUNDS) |
| `last` | `name` | the row of the focus, in the last round of the `fix` with the name (FIX.LAST) |
| `ext` | `kind`, `data` | the value of an extension handler |

- **[IR.JSON]** An expression gives the same expression after `serialize` and `parse`, if each literal is JSON data or a value of a domain. A domain value needs `encode` and `decode` in its domain. A domain value can be in a list or a record of a literal. A key `__proto__` of a record of a literal, of a `let` or of a `rec` is a key too.
- **[IR.JSON.NUMBER]** A literal number that JSON has no text for (`-0`, `NaN`, `Infinity` or `-Infinity`) gets the form `{ "$vex": "number", "value": text }`.
- **[IR.JSON.ESCAPE]** A record of a literal with the key `$vex` gets the form `{ "$vex": "escape", "value": record }`. Thus `parse` does not read data as a domain value. A record with another form of `$vex` stays data.

### 4.1 Documents

A document is the form of an expression in [coeval](https://github.com/mark1russell7/coeval), the kernel of the family. Its rules are the decision D12 of coeval. Each term is an envelope `{ "type": t, "value": v }`. `toDocument` writes a document, and `fromDocument` reads it.

Since decision D13 of coeval, the kernel is the core of Vex. It checks and analyzes each document by the contracts of the kinds of Vex. It is also the reference tier of Vex (EVAL.REFERENCE).

| Expression | Document |
|---|---|
| `lit` | the JSON value, or `{ "type": "lit", "value": v }` |
| `ref` | `{ "type": "ref", "value": ["self", ...moves, ...fields] }` |
| `var` | `{ "type": "ref", "value": ["names", name] }` |
| `app` | `{ "type": ["ops", ...keys], "value": [...args] }` |
| `let` | `{ "type": "let", "value": { "bind": names, "body": term } }` |
| `fn` | `{ "type": "fn", "value": { "params": texts, "body": term } }` |
| `call` | `{ "type": "call", "value": { "fn": reference, "args": terms } }` |
| `rec` | `{ "type": "record", "value": { ...fields } }` |
| `each` | `{ "type": "each", "value": { "axis", "as", "body", "at" } }` |
| `fold` | `{ "type": "fold", "value": { "axis", "as", "init", "step", "result", "at" } }` |
| `iterate` | `{ "type": "iterate", "value": { "limit", "init", "step", "until", "result" } }` |
| `fix` | `{ "type": "fix", "value": { "name", "join", "init", "step" } }` |
| `last` | `{ "type": "last", "value": name }` |
| `ext` | `{ "type": ["ext", ...keys], "value": data }` |
| a move | `{ "type": ["moves", kind], "value": v }` |
| an axis | `{ "type": ["axes", name], "value": { ...parameters } }` |

- **[DOC.ROUND-TRIP]** `fromDocument(toDocument(e))` gives `e`, if each literal is JSON data or a value of a domain with `encode` and `decode`. A document is JSON data, so it can go through JSON text.
- **[DOC.TERM]** In a position that holds terms, an envelope is a term, and another JSON value is a literal. A literal with the shape of an envelope is `{ "type": "lit", "value": v }`. The root of a document from `toDocument` is always an envelope. A term has no `name` and no `own` entries. A type can be a text, a list of keys or a reference into the world.
- **[DOC.LITERAL]** The value of a literal has the JSON form of IR.JSON. Thus a domain value, `-0`, `NaN` and the infinities have the forms with the key `$vex`.
- **[DOC.OPS]** The type of an op is `["ops", ...keys]`. The keys are the name of the op, split at its dots. The value is the list of the arguments.
- **[DOC.REF]** A reference is a path from a root. A reference from `self` has the moves of its address and then the segments of its path. A reference from `names` has one step: a name of a `let`, a function, a loop or the caller. Vex reads from no other root.
- **[DOC.MOVE]** The value of the move `key` or `index` is a term. A text key and a number position are fixed. Another term is a computed key or position, for example a term in an envelope. A literal of another kind gives `#VALUE!` at run time (NAV.COMPUTED). The value of `offset` is the list of its numbers. The value of `other`, `origin` and `parent` is `null`.
- **[DOC.ADDRESS]** The field `at` of `each` and `fold` is a reference from `self` with moves only. An empty address and no address are the same expression, and the document has no field `at` for them.
- **[DOC.CONSTRUCT]** The constructs `let`, `fn`, `record`, `each`, `fold`, `iterate` and `fix` have the fields of the table, and no other fields. Only `at`, `as` and `until` are optional. `as` is a list of one or two names. It needs the axis `list`, also inside `reverse` and `where`. Its two names are not the same, and a name of `init` is not a name of `as`. `limit`, `params`, `name` and `join` are data, not terms (DOC.LIMIT). The value of `last` is the name of its `fix`.
- **[DOC.LIMIT]** The field `limit` of `iterate` is a whole number, an envelope of the kind `limit` with a whole number, or an envelope `{ "type": "size", "value": { "axis" } }`. A data limit has the form `size`, and its axis has the form of DOC.AXIS. A number gives the bare number when it is written.
- **[DOC.CALL]** The field `fn` of `call` is a reference to a name: `{ "type": "ref", "value": ["names", name] }`. Thus a call applies a function that a `let` binds.
- **[DOC.AXIS]** The value of an axis is a record of its parameters, with the same names as the fields of the axis. An axis without parameters has the value `{}`. `list` and `test` are terms, and `axis` is an axis.
- **[DOC.EXT]** The type of an extension is `["ext", ...keys]`. The keys are the kind, split at its dots. The value is the data, without a change.
- **[DOC.ENTRY]** `compile`, `evaluate`, `explain` and `parse` take a document or an expression. For a document, they give the results of its expression. `tiered`, `generate` and `emitModule` of the compiler also take a document.
- **[DOC.ERROR]** `fromDocument` does not throw. A document that is not valid gives `#VALUE!` with the reason and its location as a JSON Pointer. A document nested deeper than `MAX_DOCUMENT_DEPTH` documents gives `#DEPTH!`. The expression of a valid document is valid, as EVAL.SHAPE tells. `toDocument` gives `#VALUE!` for an expression that is not valid, or for a literal without a JSON form. It writes an expression of any depth.
- **[DOC.CHECK]** `VEX_WORLD` gives the contract of each kind as data: the shape of its parts, the data of its fields and its names. The `check` of the kernel reads it before `fromDocument` reads the expression. Thus the kernel finds each kind that Vex does not have, and each missing or extra field. It also finds each value of a field of the wrong type, and each part of a kind that its position does not permit. Only the grammar of Vex stays in `fromDocument`: the steps of a reference, the address, the function of a call and the loop names.

## 5. Evaluation

- **[EVAL.TOTAL]** The interpreter does not throw. It gives a value or an error value. A value is not `undefined`.
- **[EVAL.PURE]** An evaluation does not change any state. Two evaluations of the same expression at the same key give the same result.
- **[EVAL.SHAPE]** `compile` and `evaluate` check the shape of the expression first, as `isExpr` does. An expression that is not valid gives `#VALUE!` with the reason, and the evaluation does not start. For example, a node of a newer version of Vex has a tag that an older version does not know. `shapeError` gives the reason, and a sheet and the compiler give the same error.
- **[EVAL.NESTING]** `compile` and `evaluate` accept an expression nested up to 500 levels deep. A deeper expression gives `#VALUE!` before the evaluation. `isExpr` and `deps` use a stack, not recursion, so they accept an expression of any depth.
- **[EVAL.DEPTH]** An evaluation in the limit of EVAL.NESTING does not fill the call stack of the engine. If host code fills the call stack, for example an extension or an op, the error is `#DEPTH!`. `ifError`, a reduction that skips errors and `#ARGS` do not hide `#DEPTH!`, because the engine failed, not the data.
- **[EVAL.ORIGIN]** An origin that is not a key of the space gives `#REF!`.
- **[EVAL.LOCATION]** An error value has the path of the node that made it, and the origin and the focus of the evaluation at that node. An extension handler can give an error without an origin. Then the interpreter adds the path, the origin and the focus of the extension node.
- **[EVAL.COMPILE]** `compile(e, options)` gives a program. Its `run` and `explain` give the same results and the same traces as `evaluate` and `explain`. One program evaluates at each origin of each space, and one evaluation does not change a later evaluation.
- **[EVAL.REFERENCE]** The interpreter of `@mark1russell7/vex`, the compiler of `@mark1russell7/vex-compiler` and the reference tier give the same value or the same error code. The reference tier is the kernel of coeval. `kernelPlan` gives the plan of a program in the kernel, with the machine `vexMachine`. Its `evaluate` evaluates the plan. Its `reference` reads the document with the reference interpreter of the kernel, which compiles nothing. `referenceEvaluate` of `@mark1russell7/vex-testkit` uses `reference`.
- **[EVAL.AGREE]** `agree` of a plan of the kernel evaluates the program with `evaluate`, `reference`, the traced evaluation of the kernel and a second evaluation. Then it evaluates the tier of the caller, when the caller gives one. It gives the result, or the first tier that gives another result. Two errors agree when they have the same code. Two values of one class agree when their fields agree.

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
- **[CALL.THROW]** An op that throws gives `#CALC!`. The error keeps the thrown value. A full call stack gives `#DEPTH!` (EVAL.DEPTH).
- **[CALL.RESULT]** An op result that is `undefined` or `null` gives `#CALC!`. A number that is not finite, or a domain value that fails the `valid` check of its domain, gives `#NUM!`.
- **[CALL.ARGS]** The interpreter evaluates all arguments. One failed argument gives its own error. Two or more failed arguments give `#ARGS`, with each error as a cause.
- **[CALL.STRING-ARGS]** A string literal is a value. The builder makes a field reference only from a bare string.

### 5.3 Bindings and records

- **[LET.BIND]** `let` binds each name to the value of its binding, for the body.
- **[LET.LAZY-ERROR]** A binding that fails has an effect only where a `var` reads it.
- **[LET.UNBOUND]** A name without a binding gives `#NAME?`.
- **[LET.VARS]** The caller of the interpreter can give variables.
- **[FN.BIND]** A binding of `let` can be a function: the node `fn` with the names of its parameters and a body. The names of the parameters are distinct. A function is only the value of a binding of `let`.
- **[FN.CALL]** The node `call` applies a bound function to arguments. Each parameter gets the result of its argument at the call, and an argument that fails has an effect only where the body reads it. The body evaluates at the position of the call, with the names of the place of the binding. A parameter, a binding or a name of a loop with the name of a function hides the function.
- **[FN.TOTAL]** A binding of `let` does not see the other bindings of that `let`. Thus a function cannot call itself or another binding of its `let`, and each call ends.
- **[FN.ARGS]** A call with another number of arguments than the parameters gives `#VALUE!`. A call of a name without a binding gives `#NAME?`, and a call of a value gives `#VALUE!`.
- **[FN.VALUE]** A function is not a value: a `var` of its name gives `#VALUE!`.
- **[REC.FIELDS]** `rec` makes a record of its fields. Each field is an own field of the record, also the field `__proto__`. Two or more failed fields give `#ARGS`.

### 5.4 Axes

- **[AXIS.ALL]** The axis `all` has each key of the space as a target.
- **[AXIS.OTHERS]** The axis `others` has each key except the focus as a target.
- **[AXIS.OTHERS.ORIGIN]** Inside an axis, the focus is the target, and the origin does not change. A value bound outside the axis keeps its value. Thus a base value from the origin and a field of the target can meet in one body.
- **[AXIS.OTHER.PAIR]** The axis `other` has the other key of a pair as a target. Outside a pair, it gives `#REF!`.
- **[AXIS.NEIGHBORS]** The axis `neighbors(4)` or `neighbors(8)` has the neighbor cells of the focus in a grid as targets. Outside a grid, it gives `#REF!`.
- **[AXIS.TREE]** In a tree space, the axis `children` has the children of the focus as targets, in key order. `ancestors` has the parent first and the root last. `descendants` has each key under the focus, depth first, with each parent before its children. `siblings` has the other children of the parent, or the other roots for a root. In a space that is not a tree, each of these axes gives `#REF!`.
- **[AXIS.WINDOW]** The axis `window(from, to)` has the targets of the moves `offset(d)` for each whole number `d` from `from` to `to`, in order. The offset 0 is the focus, and an offset outside the space has no target. In a tree space, the offsets go among the siblings. In a space where an offset with one number is not valid, the axis gives `#REF!`.
- **[AXIS.REVERSE]** The axis `reverse(axis)` has the targets of `axis` in the reverse order, from the last to the first. The inner axis is a base axis: not `where`, `reverse` or `table`. A test goes outside it: `where(reverse(axis), test)`. A fold over it starts at the last target, and an error of the inner axis is the error of the reverse order.
- **[AXIS.LIST]** The axis `list(expr)` has the keys of the items of the list that `expr` gives as targets, in the order of the list. `expr` evaluates at the key of the address, before the targets. A value that is not a list gives `#VALUE!`. An error item gives an error item for its target. A key that is not in the space has no record. The axis `reverse` can contain the axis `list`.
- **[AXIS.LIST.ITEM]** In `each` or `fold` over the axis `list`, the field `as: [item]` binds the name `item` to the value of the item of each target. An error item gives an error item for its target, as AXIS.LIST tells. There, the body or the step does not evaluate, and the names bind nothing. In a fold, that error is the value of the fold.
- **[AXIS.LIST.INDEX]** The second name of `as: [item, index]` binds the position of the item, from 0, as `nth` counts. LIST.LENIENT applies: the error items do not count. Thus `nth(list, index)` gives the item. Under `reverse`, the index is the position in the list, not in the order of the loop.
- **[AXIS.LIST.SCOPE]** The names of `as` are visible only in `body` and in each `step`. They hide an outer name of the same name. The test of `where`, the list, the address, `init` and `result` do not see them. There, the name refers to the outer binding, or gives `#NAME?`.
- **[AXIS.TABLE]** The axis `table(name)` has each key of the table `name` of the evaluation as a target, in key order. Its body and its test evaluate in the space of that table, and there the origin is the target. A value of the space of the origin goes in through a variable. An evaluation without that table gives `#REF!`.
- **[AXIS.GRAPH]** In a graph space, the axis `successors` has the ends of the edges from the focus, in the order of the edges. `predecessors` has the keys with an edge to the focus, in key order. `reachable` has each key that a path of one or more edges reaches, once, in the order of a breadth-first search, without the focus. In a tree space, the edges go from a parent to its children. In another space, each of these axes gives `#REF!`.
- **[AXIS.WHERE]** The axis `where(axis, test)` keeps the targets of `axis` where `test` gives `true`. A test that fails, or that does not give a boolean, gives an error item for that target.
- **[AXIS.OTHERS-UNION]** The targets of `others` and the focus are the targets of `all`.
- **[AXIS.OTHER-TWICE]** In a pair, the address `[other, other]` points to the focus.
- **[AXIS.ADDRESS]** An axis with an address finds its targets from the key where the address points, not from the focus. A failed address gives `#REF!`. Inside the body, the focus is the target, and the origin does not change.
- **[AXIS.ADDRESS-EXTEND]** Let `k` be the key of the address. For a body that does not read the origin, the axis gives the same list as the axis at origin `k`.
- **[AXIS.EXTEND]** For an expression that does not read the origin, the item at key `k` of `each(all, e)` equals `e` evaluated at origin `k`. This is the law of a comonad: extract after extend gives the program.

### 5.5 Lists

- **[LIST.LENIENT]** A list op skips error items by default. With `{ strict: true }`, the first error item is the result.
- **[LIST.OPS]** `listOps(options)` gives the list ops of `compile` for the values of a host, on a list and on an array (LIST.ARRAY). Each op gives the result of `evaluate`. An error of the op has the position and the path of the call. An error of an item stays as it is.
- **[LIST.EMPTY]** `min`, `max`, `mean` and `first` of an empty list give `#N/A`. `sum` gives 0 and `count` gives 0. For `reduce`, refer to LIST.REDUCE.EMPTY.
- **[LIST.REDUCE.EMPTY]** An empty `reduce` gives the identity of the op, if exactly one domain has an identity for the op. If more domains have one, it gives `#N/A`, and the option `domain` names the domain to use. An unknown domain name gives `#NAME?`.
- **[LIST.KINDS]** `sum`, `mean`, `min` and `max` need numbers. `any`, `all` and `none` need booleans. A value of another kind gives `#VALUE!`.
- **[LIST.REDUCE]** `reduce` folds the values from the left with a domain op. For an associative op, any order of reduction gives the same value.
- **[LIST.VALUE]** A list is a value. A `let` can bind it, and a list op applies to a name of a list.
- **[LIST.SHAPE]** A value is a list only if its kind is `vex.list` and each item has a text `key` and a result. A result is `{ ok: true, value }` with a value that is not `undefined`, or `{ ok: false, error }` with an error value. An error value has a text `code`, `kind` and `message`, and a `path`. Another value with the kind `vex.list` is a record, so no list op applies to it.
- **[LIST.SORT]** `sortBy(list)` gives a list with the items in the order of their values, from the smallest. The sort is stable. The values are all numbers without `NaN`, or all texts. Texts compare by their UTF-16 code units. Another value gives `#VALUE!`.
- **[LIST.SORT.BY]** `sortBy(list, { by: name })` sorts the items by the result of the op `name` on each value, as LIST.SORT tells, and keeps their keys and values. The op comes from the first domain that accepts the value and has the op, as for `reduce`. LIST.LENIENT applies before the op, so `{ strict: true }` gives the first error item. The op applies in the order of the list, and its first error is the result. A value without the op gives `#NAME?`, and a `name` that is not a text gives `#VALUE!`. An empty list gives an empty list, and no op applies.
- **[LIST.TAKE]** `take(list, n)` gives a list of the first `n` items. A larger `n` gives each item.
- **[LIST.NTH]** `nth(list, i)` gives the value of the item at the position `i`, from 0. A position after the last item gives `#N/A`. For `take` and `nth`, a number that is not a whole number from 0 gives `#VALUE!`.
- **[LIST.SETNTH]** `setNth(list, i, value)` gives a list with the value `value` at the position `i`, from 0, as `nth` counts. The item at the position keeps its key. Each other item keeps its key and its value. The list that the op reads does not change. A position after the last item gives `#N/A`, and the op adds no item. A number that is not a whole number from 0 gives `#VALUE!`. A missing value gives `#VALUE!`. The value can be any value, also a list. LIST.LENIENT applies: by default, an error item is not in the new list, and the position does not count it. With `{ strict: true }` as the fourth argument, the first error item gives its error.
- **[LIST.DROP]** `drop(list, n)` gives a list of the items after the first `n` items. A larger `n` gives an empty list. As for `take`, a number that is not a whole number from 0 gives `#VALUE!`.
- **[LIST.APPEND]** `append(list, other)` gives a list of the items of `list` and then the items of `other`. Two items can have the same key.
- **[LIST.WITHOUT]** `without(list, other)` gives a list of the items of `list` whose key is not the key of an item of `other`.
- **[LIST.FLAT]** `flat(list)` gives a list of the items of the lists that are the values of the items of `list`, in order. A value that is not a list gives `#VALUE!`.
- **[LIST.BUILD]** An item of a list from `sortBy`, `take`, `drop`, `append`, `without` or `flat` keeps its key and its value. LIST.LENIENT applies to each list that the op reads: by default, an error item is not in the new list. With `{ strict: true }`, the first error item of `list` is the result, and then the first error item of the other lists, in order. The argument `other` must be a list, and another value gives `#VALUE!`.
- **[LIST.GET]** `get(list, key)` gives the value of the first item with the key `key`. A key that no item has gives `#N/A`, and a key that is not a text gives `#VALUE!`. LIST.LENIENT applies: by default, an error item is not an item of its key. With `{ strict: true }`, the first error item of the list is the result.
- **[LIST.LITERAL]** A literal can be a list. Its JSON form is the form of `vexList`: `{ "kind": "vex.list", "items": [...] }`, and each item has a `key` and the result `{ "ok": true, "value": v }`. Thus the empty list and a list with one key are literals. A literal of the kind `vex.list` with an item of another form is a record (LIST.SHAPE).
- **[LIST.ARRAY]** An array is a list where a list op or the axis `list` needs a list. The key of each item is its position, from `"0"`, and its value is the value at the position. A position without a value, or with `null`, gives an error item of `#N/A`, as REF.MISSING tells. A list op applies to an array only when no domain and no function of the host has the op for the array. Thus each result of a domain or of a function stays. The second list of `append` and `without`, and each list of `flat`, can be an array too.
- **[LIST.INDEXOF]** `indexOf(list, value)` gives the position of the first item with the value `value`, from 0, as `nth` counts. LIST.LENIENT applies. A value that no item has gives `#N/A`. The value must be a number, a text or a boolean, and `===` compares it. Another value gives `#VALUE!`.
- **[LIST.DISTINCT]** `distinct(list)` gives the first item of each value, in the order of the list, with its key. LIST.LENIENT applies. Each value must be a number, a text or a boolean, and another value gives `#VALUE!`. `===` compares the values, as for `indexOf`. Thus each `NaN` stays.
- **[LIST.GROUP]** `group(list, keys)` gives one item for each distinct text of `keys`, in the order of its first position. The value of the item is the list of the items of `list` at the positions of its text. The item at a position has the key at the same position of `keys`, so both lists must have the same number of items. Another number gives `#VALUE!`. `keys` can be an array, as LIST.ARRAY tells. LIST.LENIENT applies to both lists, first to `list`. A position with an error item or an error key is not in a group. A key that is not a text gives `#VALUE!`. The groups are lists, not functions, so FN.VALUE stays true.
- **[LIST.JOIN]** `join(list, sep)` gives the texts of the items, in order, with the text `sep` between them. An empty list gives the empty text. LIST.LENIENT applies. A `sep` that is not a text gives `#VALUE!`, and so does an item that is not a text. A domain or a function of the host with the op comes first on an array, as LIST.ARRAY tells.
- **[LIST.FILL]** `fill(n, value)` gives a list of `n` items with the value `value`. The key of each item is its position, from `"0"`. `n` must be a whole number from 0 to 100000, and another value gives `#VALUE!`. A missing value gives `#VALUE!`. As for LIST.ARRAY, a domain or a function of the host with the op `fill` comes first.

### 5.6 Special forms

- **[FORM.IF]** `if` evaluates only the branch that its condition selects. A condition that is not a boolean gives `#VALUE!`.
- **[FORM.AND-OR]** `and` and `or` stop at the first argument that decides the result.
- **[FORM.IFERROR]** `ifError` gives its first argument, or its second argument when the first is an error.

### 5.7 Iteration

- **[LOOP.NAMES]** `fold` and `iterate` bind the names of their record `init` to its values, at the node. A step evaluates each expression of the record `step` with the values before the step. Then each name of `step` gets its new value, and the other names keep their values. `result` evaluates at the node with the last values, and it gives the value. A name of `step` that is not a name of `init` makes the expression not valid.
- **[FOLD.ORDER]** `fold` makes one step at each target of its axis, in the order of the axis. The focus of a step is the target. A target that a test of `where` removes has no step. The tests evaluate before the steps, so a test cannot read the names of the fold.
- **[FOLD.ERROR]** The first error of a value, of a test or of `result` is the value of the fold. A test that is not a boolean gives `#VALUE!`.
- **[ITERATE.LIMIT]** `iterate` makes `limit` steps at the position of the node. `limit` is a whole number from 0 to 100000 in the expression, or a data limit (ITERATE.LIMIT.DATA).
- **[ITERATE.LIMIT.DATA]** A data limit is a record with the one field `axis`. The limit is the number of targets of the axis, so `iterate` makes the steps of a `fold` over that axis. The axis `list` gives the count of a list. The limit evaluates one time, after `init` and before the first test of `until`, at the position of the node. It reads the names outside the loop, and not the names of the loop. LOOP.SIZE reads a data limit as it reads the axis of a `fold`. Thus a limit that reads a list of an outer loop is a use of that list.
- **[ITERATE.LIMIT.ERROR]** A data limit that is not valid gives `#NUM!` of the kind `limit`, and `causes` holds the inner error. These limits are not valid: an axis that the run cannot read, a value that is not a list, and a count above 100000. An error of a list, of an item or of a test also makes the limit not valid. `#DEPTH!` and `#CYCLE!` stay as they are, because they stop the run and do not come from the limit (EVAL.DEPTH, SHEET.CYCLE). If items give both, `#DEPTH!` decides.
- **[ITERATE.UNTIL]** With `until`, the test evaluates before each step and after the last step. A true test stops the iteration. With no true test, the value is `#NUM!`. A test that is not a boolean gives `#VALUE!`.
- **[ITERATE.ERROR]** The first error of a value, of the test or of `result` is the value of the iteration.
- **[LOOP.LIST]** A name of `fold` or `iterate` can hold a list (LIST.VALUE). A step gives a new list from the values before the step, for example with `append`, `drop`, `setNth` and `without`. Thus a list can be the stack or the seen set of a search, or the positions of a layout. A step reads the old value at a key with `get` (LIST.GET).
- **[LOOP.SIZE]** The size of a value of a loop has a bound that is a polynomial of the number of steps. A value does not grow by a factor at each step. The size of a list or a text includes its items and characters. A step gives each name a new value. Each sum of the bound of that value uses the old lists and texts of the loop at most one time (LOOP.SIZE.BRANCH). For example, a step with `append(xs, xs)` uses `xs` two times, and it doubles the list at each step.

  A nested loop or `each` reads an item at each step or target. Thus a body with one copy of its item uses the list one time (LOOP.SIZE.COPY). A body that holds another list of the loop uses that list many times. A function counts the uses of its arguments. A value from outside the loop is a constant, so `append(xs, outside)` is valid. A chain of names that grows by a factor at each step is not valid. `compile` refuses an expression that breaks this rule with `#VALUE!`, and so do tier 2, `emitModule` and `vex_check`. The reason names the loop, the name and the op.
- **[LOOP.SIZE.BRANCH]** The bound of a value is the largest value of at most eight sums. `if` and `ifError` give the larger of two values, not their sum, so a step can swap two names in an `if`. A sum with no name of a cycle of the loop sets a value again, so it does not add at each step. A sum that another sum covers does not count. A bound with more than eight sums becomes one sum that covers each of them.
- **[LOOP.SIZE.COPY]** A step can copy a list of the loop item by item. In `fold(list(xs), { acc: empty }, { acc: append(acc, fill(1, it)) }, acc)`, the name `acc` has the bound of `xs`. Thus a loop over `append(xs, fill(1, n))` is valid. A step that appends two copies of each item doubles the list, so it is not valid.
- **[LOOP.SIZE.OPS]** Each op that can give a list or a text has a size rule as data. The rule is the property `size` of the op, or `size: "fixed"` of its domain. A function of the host has a rule in its property `size`. An op with no rule that gets a value of the loop makes the loop not valid, and the reason names the op.
- **[LOOP.SIZE.SETNTH]** The size rule of `setNth` counts the list one time and the value one time. The bound keeps the old item, because a bound cannot subtract. The count of the items does not grow. The largest item is the larger of the old largest item and the value. An item of the list is the measure of the largest item, not the size of the list. Thus `setNth(xs, i, add(nth(xs, i), 1))` is valid, as `append(xs, fill(1, nth(xs, i)))` is. A value that holds the list uses the list two times, so `setNth(xs, 0, xs)` is not valid. A value that holds two old items doubles the largest item, so `setNth(xs, 0, append(nth(xs, 0), nth(xs, 0)))` is not valid.
- **[LOOP.SIZE.PART]** A value has a fifth measure: its largest part, the largest item of an item. The items of a record are its fields. A field of an item has the size of a part of the list. Thus a record from the fields of one item does not grow the parts. Thus `setNth(xs, 0, rec({ a: field(nth(xs, 0), "a"), b: field(nth(xs, 0), "b") }))` is valid. A record of two whole items is not valid, because a part of the new item is an old item. `take` with a literal limit has the bound of that number of the largest item. Thus `append(take(xs, 2), take(xs, 3))` is valid. The same bound holds for the items of `each`. It does not hold for a list with long keys, because a key is not in the bound of an item. A size rule gives the largest part in its property `part`. Its use `limit` reads the literal number at the position `limit` of the op.
- **[LOOP.SIZE.READINGS]** The check reads a program two times, and one reading that accepts the whole program makes it valid. The first reading counts a part as a whole item, and it counts a fixed number of items as the whole list. The second reading keeps the parts and the rules `byParts`. Neither reading covers the other. In the first reading `fill(1, take(xs, 3))` has a list of one item, and in the second reading it holds three old items. The reason of a refusal comes from the first reading.

### 5.8 Steps

A step is a level of the power of the language. A host sets the highest step that it accepts.

- **[STEP.LADDER]** The steps of Vex are A, B and C, from the lowest to the highest. Step A has loops with a fixed count. Step B adds limits from the data, and fixed points whose steps move one way. Step C adds functions that call themselves, with a budget. Each construct has a step as data in `CONSTRUCT_STEPS`. The data limit of `iterate` is the construct `iterate.size`, of step B. Each other construct is of step A.
- **[STEP.LOWEST]** The step of a program is the highest step of its nodes. The reason is the first node with that step, in the order of `children`, with its construct and its path. `programStep` gives the step and the reason.
- **[STEP.MAX]** The host option `maxStep` sets the highest step that the host accepts. The default is B. A program above `maxStep` is not valid. `compile`, tier 2, `emitModule` and `vex_check` refuse it, and the reason names the needed step. A program has no field for its step, so a document cannot raise its own step. A value of `maxStep` that is not a step is not valid. The default B fails closed. Each construct of step B has a bound of cost from the size of the input. Each construct of step A has one too (`LOOP.SIZE` and the evaluation budget). A construct without such a bound has step C.
- **[STEP.VALUE]** The option `maxStep` changes only which programs the host accepts. Each accepted program gives the same value at each step. LOOP.SIZE, EVAL.PURE and P17 hold at each step.
- **[STEP.CYCLE]** A cycle of cells without an explicit fixed point gives `#CYCLE!` at each step.
- **[STEP.TOOLS]** `vex_check` gives the step of the program and the reason. `vex_explain` gives the step at the root, on the first line of the trace.

### 5.9 Fixed points

The node `fix` makes a column: one value for each row of the space. It repeats a step until no row changes. Each step moves each row one way, so the rounds stop, and the result does not depend on the order of the rows. The construct is of step B.

- **[FIX.ROUNDS]** `init` evaluates at each row, and it gives round 0. Round `r` evaluates `step` at each row, and each read sees only round `r - 1`. The first round with no changed row ends the rounds. The value of the node is the row of the focus.
- **[FIX.ROWS]** The rows are the keys of the space where the node evaluates. In a body of the axis `table`, they are the keys of that table. The focus of `init` and of `step` is the row. The origin stays the origin of the node, so a read of the origin gives one source for all the rows. `deps` gives the axis `all` around the reads of `init` and of `step`.
- **[FIX.JOIN]** `join` is `or`, `and`, `max` or `min`. The next value of a row is the join of its old value and the value of `step`. The joins `or` and `max` move a row up. The joins `and` and `min` move a row down. Thus `join` declares the direction of the column.
- **[FIX.KIND]** The values of `or` and `and` are booleans. The values of `max` and `min` are finite numbers. A value of another kind gives `#VALUE!`. A number that is not finite gives `#NUM!`.
- **[FIX.LAST]** The node `last` gives the value of the focus in the last round of the `fix` with the name. The inner `fix` of a name hides an outer one. A `last` belongs in the `step` of a `fix` with its name. Each other `last` is not valid. The names of `fix` are not names of `let`, so `var` does not read a column. An axis moves the focus of a read. A focus that is not a row gives `#REF!`.
- **[FIX.MONOTONE]** A program is valid only if the check proves that each `step` does not fall when the last round rises, for each join. A proof comes only from FIX.OPS and from these rules. The start `init` does not read the last round. `if` has a test that does not read the last round. A branch of `if`, an argument of `and`, `or` and `ifError`, a binding of `let` and a body of `each` can read it. The axis, the address and the tests of `each` do not read it, and the body of the axis `table` does not read it. Each other node with a part that reads the last round has no proof. These nodes are a record, a move of a reference, `fold`, `iterate`, a call, and a `fix` that reads an outer `fix`. `compile`, tier 2, `emitModule`, the kernel and `vex_check` refuse a program without a proof, and the reason names the part.
- **[FIX.OPS]** An op has a direction for each argument as data, in the property `monotone` of its spec: `up` or `down`. A function of the host states it in the same property. The list ops `any`, `all`, `min` and `max` have `up` for the list, and `none` has `down`. The first argument of an op that reads the last round has a known kind, because the kind selects the op. An op without a rule cannot take a value that reads the last round. The direction of an op is a law. The op does not fall when an `up` argument rises. It does not rise when a `down` argument rises.
- **[FIX.LIMIT]** A column of `n` rows makes `n + 1` rounds at most, and 100000 at most. A boolean column stops in this limit. A number column stops in it when its steps follow paths, because a path has fewer rows than the column. A column that still changes in the last round gives `#NUM!` of the kind `limit`, and no value of a row. A host option does not change the limit (STEP.VALUE). A step can set a cap with `min` or `max`.
- **[FIX.ERROR]** Each row evaluates in each round, also after an error of another row. One failed row gives its error, and two or more give `#ARGS` with each error as a cause. `#DEPTH!` wins over each other error (EVAL.DEPTH), and `#CYCLE!` wins next (SHEET.CYCLE). An error of a row fails the column, so `last` does not read an error. A row catches its own error with `ifError`.
- **[FIX.ORDER]** The rounds do not read the order of the rows. Each round reads only the last round, and an op that reads the order of the items has no rule. `sum` has no rule too, because the rounding of floats depends on that order. A part that does not read the last round can read the order, as in each program.
- **[FIX.TRACE]** `explain` records an event for each round after the event of its reads. The field `round` holds its count from 0 and the keys of the rows that it changed. The result of the event is the column as a list. The node then records its usual event.

## 6. Folds

- **[TRACE.EVENTS]** `explain` records one event for each node evaluation, in the order that the nodes finish. A reference event records its reads.
- **[TRACE.AXIS]** Inside an axis, the focus of each event is the target.
- **[DEPS.READS]** `deps` gives each reference of an expression, with its address, the axes around it and the address of each axis. The static kit of the kernel finds the references of the document of the expression (`refsOf`). The contracts give the names that each kind binds. Vex adds the axes and the reads of a function at each of its calls.
- **[DEPS.COMPUTED]** A computed move keeps its expression in the address that `deps` gives. Only a run knows its key. `deps` also gives the references of that expression, with the axes around its node.

## 7. Domains

- **[DOMAIN.OWNED]** A domain owns its op table. `defineDomain` does not change a class or a prototype, and an import has no side effects.
- **[DOMAIN.LAWS]** Each law that a domain declares holds for the values of the domain. `@mark1russell7/vex-testkit` checks each law with property tests.
- **[KIND.PRIMITIVE]** A domain with `primitive` accepts each value of that JavaScript type, and no other value. The law checker of the test kit checks it.
- **[KIND.RETURNS]** An op with `returns` gives a result of that kind, or an error. The law checker checks each such op on random values. The kind `domain:Name` is a value of the domain `Name`, for example the op `xy` of `NumDomain` gives a value of `XYDomain`. The law checker checks such an op when its option `domains` has that domain.
- **[KIND.RETURNS.LIST]** The kind `list:number`, `list:string` or `list:boolean` is a `vex.list` with items of that primitive type. An error item does not break the kind. The law checker checks such an op on random values.

### 7.0 The op `codePoints` of `TextDomain`

- **[TEXT.CODEPOINTS]** `codePoints(text)` gives a list of numbers with one item for each code point of the text, in order. The key of an item is its position, from `"0"`. A pair of surrogates is one item, and a lone surrogate is an item with its own value. The empty text gives the empty list. The op has the kind `list:number`. A receiver that is not a text has no op.

### 7.1 The axes of `Vec2Domain`

A layout rule often works along a main axis and a cross axis, for example the total of a stack. A unit axis `dir` is (1, 0) for a row or (0, 1) for a column. These ops let one program serve both dimensions.

- **[VEC2.ALONG]** `along(v, dir)` gives `dot(v, dir)`: the component of `v` along the unit axis `dir`. `across(v, dir)` gives `dot(v, swap(dir))`: the component on the other axis. On the axis (1, 0), `along` gives x and `across` gives y.
- **[VEC2.COMPOSE]** `compose(dir, main, cross)` gives `dir * main + swap(dir) * cross`. On a unit axis, `along` of the result gives `main`, and `across` of the result gives `cross`.
- **[VEC2.SELECT]** `select(mask, a, b)` gives the component of `a` where the component of `mask` is not 0, and the component of `b` where it is 0. A number argument becomes a vector with that number twice.
- **[VEC2.FINITE]** A `Vec2` with a component that is not finite is not valid, so an op that gives one gives `#NUM!`. Thus a bound cannot be infinite. An open bound uses `select`: `select(vec2(0, 1), max(v, lo), v)` bounds only y, and `select(hi, min(v, hi), v)` sets no bound where `hi` has a 0.

### 7.2 The domain `JsonDomain`

`JsonDomain` of `@mark1russell7/vex-domains` reads JSON data, for example the documents of a database. Each op is a function of plain data, so a standalone module can copy it. Put `JsonDomain` last in the list of domains. Then `add`, `eq` and the other ops of `NumDomain`, `TextDomain` and `BoolDomain` come first. The names `keys`, `get` and `values` are list ops, so the domain does not use them.

- **[JSON.IS]** `JsonDomain` accepts a text, a finite number, a boolean, an array and a plain object. A plain object has the prototype `Object.prototype` or `null`. A list of Vex and the value of a class are not JSON values.
- **[JSON.KIND]** `kind(v)` gives the kind of a JSON value: `"boolean"`, `"number"`, `"string"`, `"array"` or `"object"`.
- **[JSON.KINDS]** `kinds(c)` gives the kind of each item of an array, in order, or of each field of an object, in the order of `fields`. A `null`, an `undefined` or a hole gives `"null"`. The result is an array with the repeats, and the list ops read it (LIST.ARRAY). An item that is not a JSON value gives `#CALC!`.
- **[JSON.FIELDS]** `fields(o)` gives the keys of the object `o`, in the order of `Object.keys`. An array or another receiver that is not an object gives `#CALC!`.
- **[JSON.LEAVES]** `leaves(o, depth)` gives the leaves of the object `o`, in the order of a walk over its own fields, as `fields` reads them. The walk goes into an object with fields when the path of its field has fewer than `depth` keys. Each leaf is a record `{ path, kind, value }` with the kind of `kinds`, and a `"null"` leaf has no `value`. A path joins the keys with `.`, but after an empty path it is the key alone. A number `depth` that is not a whole number from 1 to 100 gives `#CALC!`. A receiver that is not an object, and a value that is not JSON, give `#CALC!` too.
- **[JSON.FIELD]** `field(o, k)` gives the value of the own field `k` of the object `o`. A missing key, a field that is `null`, a key that is not a text and a receiver that is not an object give `#CALC!`. Thus an inherited member, for example `constructor`, is not a field.

### 7.3 The sign and the smallest axis

A force separation pushes two boxes apart along the axis of their smallest overlap, with the sign of their gap. For the overlap `o` and the gap `g`, the push is `minAxis(o) * sign(g) * o`. A gap of 0 on that axis gives no push.

- **[NUM.SIGN]** `sign(n)` gives the value of `Math.sign(n)`: 1 for a positive number, -1 for a negative number, 0 for 0 and -0 for -0. An infinite number gives 1 or -1, because an op checks its result and not its receiver. `NaN` gives `#NUM!`.
- **[VEC2.SIGN]** `sign(v)` of `Vec2Domain` gives the sign of each component, as NUM.SIGN tells. A component `NaN` gives `#NUM!`, as VEC2.FINITE tells. An infinite component gives 1 or -1.
- **[VEC2.MINAXIS]** `minAxis(v)` gives (1, 0) if `x <= y`, else (0, 1). The comparison uses the signed values, and `minAxis(abs(v))` compares the sizes. A tie gives (1, 0), and 0 and -0 tie. Infinite values compare as numbers. A component `NaN` gives `#NUM!`. For finite components, `along(v, minAxis(v))` gives `minComponent(v)`, and `across(v, minAxis(v))` gives `maxComponent(v)`.
- **[XY.SIGN]** `sign` and `minAxis` of `XYDomain` give the components of the same ops of `Vec2Domain`. Each one is a function of plain data, so a standalone module can copy it.

### 7.4 The domain `InsetsDomain`

`InsetsDomain` of `@mark1russell7/vex-domains` keeps the four sides of an inset as plain data, so a module can copy it. `start` is the pair of the leading sides, and `end` is the pair of the trailing sides.

- **[INSETS.VALUE]** A value is a plain object with exactly the number fields `startX`, `startY`, `endX` and `endY`. `insets(startX, startY, endX, endY)` of `NumDomain` makes a value. Put `InsetsDomain` before `NumRecordDomain`, which accepts the same objects.
- **[INSETS.LIFT]** A number in the argument of `add` becomes a value with four equal sides. A number as the receiver stays a number. Thus `insets(0, 0, 0, 0).add(pad)` takes a number or a value, with no test of the type.
- **[INSETS.SIDES]** `startX`, `startY`, `endX` and `endY` give one side. `start` gives the `XY` value (`startX`, `startY`), and `end` gives (`endX`, `endY`). A box inset adds `start` to the corner, and it subtracts `start` and `end` from the size.
- **[INSETS.VEC2]** `startVec2` and `endVec2` give the same pairs as `Vec2` values, for a program of `Vec2Domain`. A module cannot copy the class `Vec2`, so it refuses these two ops with a reason.
- **[INSETS.ARITH]** `add` adds each side, and its identity is `insets(0, 0, 0, 0)`. `scale(i, k)` multiplies each side by `k`, so `scale(i, -1)` gives the outset of `i`.
- **[INSETS.FINITE]** A value with a side that is not finite is not valid, so an op that reads or gives one gives `#NUM!`. An inset with an infinite side has no box, as VEC2.FINITE has no vector.

## 8. The builder

- **[BUILD.IMMUTABLE]** A builder call gives a new chain. An earlier chain does not change.
- **[BUILD.AXIS.ADDRESS]** The moves before an axis are the address of the axis. Thus `parent().children(f)` evaluates `f` at each child of the parent.
- **[BUILD.LIST.KEYS]** A list chain has `keys()` and `errors()`. `keys()` gives the keys of the items with a value, in the order of the axis. `errors()` gives the error of each item that failed.
- **[BUILD.IF]** `if(then, otherwise)` on a boolean chain gives the form `if`: the expression is `app("if", value, then, otherwise)`.
- **[BUILD.LIST.READ]** A list chain gives its list at an origin with `result`, `at` and `explain`, like a chain. Each item has the key of its target and its result.
- **[BUILD.FN]** `root.fn(kinds, body)` makes a function with the kinds of its parameters. `functions(fns, body)` of a chain binds the functions, and `call` gives a chain of a call of each function.
- **[BUILD.LIST.ORDER]** A list chain has `sortBy`, `take` and `nth`. Its method `each(body)` is the axis list over its items. `fold` needs the list of an axis.
- **[BUILD.LIST.BUILD]** A list chain has `drop(n)`, `append(other)`, `without(other)` and `flat()`. `other` is a list chain, and another value makes the builder throw a `TypeError`. The body of an axis can give a list chain. Then the value of each item is a list, and only such a list chain has `flat`.
- **[BUILD.LIST.GROUP]** A list chain has `distinct()`, `group(keys)` and `join(sep)`. `keys` is a list chain of texts, and another value makes the builder throw a `TypeError`. `group` gives a list chain whose items are lists. `join` needs a list chain of texts, and `sep` is a text or a chain of a text.
- **[BUILD.LIST.LOOP]** In `iterate` and `fold`, a name whose first value is a list chain is a list chain in `step`, `until` and `result`. Its next value must be a list chain with items of the same type. A list chain as `result` gives a list chain. `root.list(items)` gives a list literal, and a list chain has `get(key)`. The key is a key of the space or a chain of a text.
- **[BUILD.LIMIT]** The limit of `iterate` in the builder is a number, a `DataLimit` from `dataLimit(axis)` or a list chain. A list chain gives a data limit over the axis `list`.
- **[BUILD.LIST.ITEM]** In `each` of a list chain, the body also gets a chain of the item and a chain of its index (AXIS.LIST.ITEM, AXIS.LIST.INDEX). In a fold over the axis `list`, the step also gets the index after the item. The builder writes `as` only with the names that the body or the step reads. A loop inside a body or a step gets other names. Another axis has no index, so a step that reads it makes the builder throw a `TypeError`.
- **[BUILD.FIX]** `fix(name, join, init, step)` of a chain gives the node `fix` (FIX.ROUNDS), and the chain has the kind of the join. `step` gets a chain of `last`, so a program of the builder has no read outside a `step` of its column. A chain of `last` that leaves its `step` gives the error of FIX.LAST. A column inside a `step` has another name in the node, so it does not hide the column around it.
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

- **[SHEET.CELL]** A cell reference resolves its address from the focus, then gives the result of that cell. An unknown column gives `#NAME?`, and an address outside the space gives `#REF!`. The data of a cell reference has only fixed moves.
- **[SHEET.CELL.COMPUTED]** `cell(column, at)` takes computed moves (`NAV.COMPUTED`). An address of fixed moves gives a cell reference. Another address gives `first(each(window(0, 0), cell(column), at), { strict: true })`, so the form has no new node. A read gives the error of its cell, of an expression or of a move. The axis `window` needs an array space or a tree space, so another space gives `#REF!`.
- **[SHEET.CELL.COMPUTED.ORDER]** A read with a computed move keeps `SHEET.ORDER`. The run finds the cell of the read when it evaluates the read, so a cycle that only the values make gives `#CYCLE!`. The expressions evaluate before the first move, so a failing move does not stop a read of a cell in an expression.
- **[SHEET.CELL.FORMULA]** A cell can have its own formula. That formula replaces the formula of its column at its key, and the other keys keep the formula of the column. A cell without a formula gives `#NAME?`. In the builder, `cellFormula(k, column, formula)` gives the formula of a cell, and the formula must give a value of the type of the column.
- **[SHEET.TABLES]** A run can have more tables, each with a name, a space, columns and formulas of cells. A cell reference reads the table of the space where it evaluates, so the body of the axis `table(name)` reads the cells of that table. Each cell of each table evaluates once, and a cycle across tables gives `#CYCLE!`.
- **[SHEET.RECURRENCE]** A column can read itself at another key. A recurrence over the key order, for example a running total, gives the same result as a loop. The first key that a host reads does not change a result, also at the end of a long recurrence.
- **[SHEET.DECLARE]** `declare<T>()` gives the types of columns before their formulas. A formula can read a declared column with its type, also the column itself or a later column. The formula of a declared column must give a value of the declared type. `declare` has no effect at run time.
- **[SHEET.CYCLE]** Each cell on a cycle of cell references gives `#CYCLE!`. A cycle can contain one cell, or cells at different keys.
- **[SHEET.DEEP]** A run evaluates a chain of cell references of any length. The length does not depend on the call stack of the engine, and the results are the results of a recursive search.
- **[SHEET.ORDER]** The result of a cell does not depend on the order of the evaluations. `ifError` does not hide a cycle from the cells on that cycle.
- **[SHEET.FILL]** `fill(table)` evaluates each cell of a table before the reads. Each column comes after the columns that it reads, and the keys of a column follow its reads from itself. A read then gives the result of a read without the fill.
- **[SHEET.COMPILE]** A run with the option `compile` evaluates each formula of a column with a compiled program. It gives the results of a run without the option. A formula compiles once for each compiler and its options, also across runs. A compiled program reads the cells of the run that evaluates it.
- **[COMPILE.SHEET.COMPUTED]** Tier 2 evaluates a read with a computed move with no fallback. An error of the cell goes to tier 1 (`COMPILE.LIST.VALUE`). The results stay the results of the reference.

## 10. The compiler

These requirements apply to `@mark1russell7/vex-compiler`.

- **[COMPILE.TIERED]** `tiered(e, options)` gives a program with the interface of `compile`. For each space, origin, variables and tables, its `run` gives the result of `evaluate`.
- **[COMPILE.FALLBACK]** Where the generated code of tier 2 cannot give the result, tier 1 gives it. This rule applies in each context, also in the first argument of `ifError` and in an item of a list op. A page that does not permit `new Function` uses tier 1.
- **[COMPILE.FIX]** Tier 2 lowers `fix` and `last` to an array of rows and a loop of rounds. A program with `fix` runs in tier 2, with the result of tier 1 at each key. This includes each error value of a row and the failure at the round limit. A program that the check of a step refuses keeps the reason of the check.
- **[COMPILE.FIX.MODULE]** `emitModule` and `emitSheetModule` lower `fix` and `last`, with the results of the interpreter and of `SheetRun`. A column that reads no key evaluates once, on its first read. A row that reads a cell does not stop the next rows, so the search of a sheet sees each read. A column at a key of a literal or of `fill` has no row. Thus a module refuses it with the reason of the axis `list`.
- **[COMPILE.ERRORS]** Tier 2 gives the error result of a program. The error has each field of the error of `evaluate`: code, kind, message, op, path, origin, focus, causes and thrown value. The result `#ARGS` is such a result. An argument evaluates once, in the order of `evaluate`. A run that tier 2 ends with an error is no fallback of `TierStats`.
- **[COMPILE.LIST.VALUE]** Tier 2 gives a list op on a list value, a list literal and `fill`. Each list op on a list value uses the code of the interpreter (LIST.OPS). Thus a list with an error item gives the result of `evaluate`. An error of the op is an error of the program (COMPILE.ERRORS). `ifError` gives its second argument, a list op skips the error item, and a binding of `let` has no value. These send the evaluation to tier 1: `#DEPTH!` and an error of an item that `strict` gives.
- **[COMPILE.LIST.ARRAY]** Tier 2 gives a list op on an array, also in the body of a list op. The op comes after the domains and the functions of the host, as in `evaluate` (LIST.ARRAY). It uses the code of the interpreter (LIST.OPS), so the op skips a hole. With `strict`, the error of the hole is an error of the program. One case sends the evaluation to tier 1: `errors` of an array with a hole, because its values have the position of the call. The result is the result of `evaluate`.
- **[COMPILE.LIST.AXIS]** Tier 2 gives `each`, `fold` and a data limit (ITERATE.LIMIT.DATA) over the axis `list`, also with `reverse`, `where`, an address and `as`. The results are the results of AXIS.LIST, AXIS.LIST.ITEM, AXIS.LIST.INDEX and AXIS.LIST.SCOPE. A value that is not a list is an error of the program (COMPILE.ERRORS). An array is a list (LIST.ARRAY). A list with an error item, or an array with a hole, sends the evaluation to tier 1.
- **[COMPILE.EXT]** In tier 2, an error of an extension is an error of the program, as an error of an op is. `ifError` gives its second argument, a list op skips the error item, and a binding of `let` has no value. An error of an extension at the result is the result of tier 2 (COMPILE.ERRORS). These send the evaluation to tier 1: `#DEPTH!` of an extension and a full call stack. Tier 2 skips no extension whose `#DEPTH!` the interpreter gives, also after an error that the program catches. The result is the result of `evaluate`.
- **[COMPILE.TRACE]** A run with a trace, and `explain`, use tier 1. Thus they give the traces of the interpreter.
- **[COMPILE.MEMO]** A program keeps the value of each node that depends only on the space, for each space. Thus a run at each key of a space evaluates such a node once. A space does not change, so each run gives the result of `evaluate`.
- **[COMPILE.GROUP]** A program keeps the value of a node for each space and each value of its keys. A key reads the origin or a name from outside the node, and nothing that the node changes. Thus an aggregate over the group of the origin evaluates once for each group.
- **[KIND.STATIC]** When the kinds of the values of an op site decide its op, the site uses that op with no guard. A value against the schema, or a result against a primitive kind of `returns`, sends the evaluation to tier 1. A result of the kind of a domain gets the checks of the interpreter.
- **[KIND.DOMAIN]** A value of a domain without a primitive type has the kind of its domain, `domain:Name`. An op with `returns: "domain"` gives this kind, and a schema can declare it for a field. A module checks such a field with a copy of `is` of the domain. It checks each copy of an op with the `samples` of the domain.
- **[KIND.FIELDS]** A domain declares `fields` when `is` accepts only plain objects with exactly these names. Two domains with different names have no common value. Thus a module keeps each of them in its own op, in each order of the domains. The law checker tests the declaration.
- **[KIND.LIFT]** A module gives a number at a lifted position to a copy of `fromScalar` of the domain. This needs the kinds of the receiver and the number before the run. Tier 2 keeps the dispatch of the runtime for this site.
- **[COMPILE.MODULE]** `emitModule(e, options)` gives an ES module with no import of Vex. For an input that keeps the schema, its run gives the value of the interpreter at each key, or `VEX_ERROR` for an error. An input against the schema throws a `VexContractError`. The option `name` is the name of the run. A reserved word, a name that the module declares or a global that a module reads gives a reason.
- **[COMPILE.MODULE.NESTING]** `emitModule` and `emitSheetModule` refuse a program past the limit of EVAL.NESTING, with the reason of the interpreter. The refusal comes before a walk with recursion, so a program of each depth gives the reason, not a `RangeError`.
- **[COMPILE.MODULE.RESULT]** In a module, an op result that is `undefined`, `null` or a number that is not finite gives the error of the interpreter (CALL.RESULT). This rule applies to each declaration `returns`. The module prints the check `k_value` around such an op. An op has no check when its kind is `number`, or when the check `valid` of its domain refuses each such result. An op also has no check when its text proves a value. A proof reads the expression body of an arrow function: a comparison, a negation, `&&` or `||` of these, or an object literal.
- **[COMPILE.MODULE.TREE]** With the option `space: "tree"`, the module is for a tree space. Its run takes the parents after the variables: the position of the parent of each record, or -1 for a root. The key of a record is the text of its position. A parent that is not -1 or a position, or a cycle of parents, throws a `VexContractError`. The move `parent`, the offsets, the window and the axes of a tree and of a graph give the targets of the interpreter.
- **[COMPILE.MODULE.TREE.ALLOC]** A forward loop over `ancestors` in a module walks up the parents, with no array. The reverse order keeps the array. The output array of a run has its length before the first key. The order of a tree keeps its keys in flat arrays of integers, and it reads only the parents. A test limits the heap bytes, the external bytes and the objects for each node of the tree case of the gate. The test reads no time.
- **[COMPILE.MODULE.SHEET]** `emitSheetModule(columns, options)` prints the formula columns of a sheet as a standalone module. Its run gives an object with an array for each column: the result at each key, or `VEX_ERROR`. These results are the results of `SheetRun` with the same formulas of cells and the same budget of the stack. Thus each cell on a cycle gives `VEX_ERROR`. The run fills the columns in the static order of `SheetRun.fill`. A formula that reads a column before the formula of that column needs the kind of that column in the option `kinds`.
- **[COMPILE.MODULE.SHEET.DIRECT]** A sheet module without formulas of cells has no search when each read of a cell reads a finished cell. A read of a column before its own column in the fill order reads a finished cell. A read of its own column reads a finished cell in three forms. These are the parent in a pre-order tree fill, the children in a post-order tree fill and one earlier key in a forward array fill. The results stay the results of `SheetRun`.
- **[COMPILE.MODULE.ONCE]** A sheet module with no search has no function for a column. The code of each formula is in a loop over the keys, and the results stay the results of `SheetRun`. Columns that follow each other in the fill order share one loop when they have the same order of the keys. Each read of an earlier column of the loop must read the key itself or one of the three forms of COMPILE.MODULE.SHEET.DIRECT.
- **[COMPILE.MODULE.LIST]** A module has the list ops `drop`, `append`, `without`, `flat`, `get` and `indexOf`. It has list literals, a list op over a `let` and lists as names of `fold` and `iterate`. Its run gives the values of the interpreter. A step must give a list of the kind of the first list of its name. The axis `list` over a list with the keys of a literal or of `fill` reads no record at a target. A read of a record at such a target gives a reason.
- **[COMPILE.MODULE.LIST.RESULT]** The value of a module can be a list, also a list of lists. The run gives it as a `vex.list` with the keys of the interpreter as text. Only a list that one object serves to more than one key is frozen (COMPILE.MODULE.FUSE.OUT). Each other list of a result is not frozen. A column of lists of a sheet holds one `vex.list` for each cell, so its lists are not frozen. An error item has the error `VEX_ERROR`. `if` and `ifError` take lists as branches. A list in only one branch gives a reason.
- **[COMPILE.MODULE.LIST.ARG]** An argument of an op after its receiver can be a list. The op gets a frozen `vex.list`, as in the interpreter. An error item has the error `VEX_ERROR`. A parameter that takes no list gives the error of the interpreter. An argument of a call can be a list too. A list as the receiver of an op that is not a list op of the module gives a reason.
- **[COMPILE.MODULE.LIST.CALL]** The value of a call can be a list. The place of the call takes it as a list, also the list ops, the axis `list`, a field and an argument. Each kind of the arguments has its own function and the facts of its list. A list of a call at a place that takes no list gives a reason.
- **[COMPILE.MODULE.LIST.INPUT]** A field of the schema can have a `ListKind`, also a list of lists and a list of `domain:<Name>`. The record holds the list as a `vex.list`. The program uses the field as a list, and the run gives the values of the interpreter. Another value, an item of another kind and an error item of `#DEPTH!` throw a `VexContractError`. The axis `list` cannot read a record at a key of such a list.
- **[COMPILE.MODULE.LIST.NESTED]** `nth`, `first` and `get` over a list of lists give a list, and each list op of a module takes that list. This is true at the place of the read, through a name of a `let`, through a parameter and through a call. Each level of a list has this rule. The run gives the values of the interpreter. An item of a list of values is not a list, and a list op over it gives the reason of a value.
- **[COMPILE.MODULE.LIST.VAR]** A variable of the schema can have a `ListKind`, also a list of lists. The variables of the run hold the list as a `vex.list`, or as an array with `lists: "plain"`. The program uses the variable as a list, and the run gives the values of the interpreter. The run reads each list once. A list against its kind gives the error of the variables, also for a list that the program does not read. The axis `list` over such a list reads no record, so it gives a reason. It takes names `as`.
- **[COMPILE.MODULE.LIST.OP]** An op of a domain with the kind `list:<Kind>` gives a list of the module (KIND.RETURNS.LIST). The place of the op takes it as a list, also the list ops, the axis `list`, a name and a result. Its run gives the values of the interpreter. A result that is not such a list is an error of Vex. The keys are text, so the axis `list` cannot read a record at a key of such a list. An earlier domain with the op can decide the site. Then the place of a list gives a reason.
- **[COMPILE.MODULE.LIST.PLAIN]** `emitModule` and `emitSheetModule` have the option `lists`, with the default `"envelope"`. The default prints the same module as before. With `lists: "plain"`, a list field of the input holds an array of the values of its items. A list of lists holds arrays to the depth of its kind. The key of an item is the text of its position. The `VEX_ERROR` of the module is an error item. Another value throws a `VexContractError`.

  The value of the run and a column of lists give an array of the values of the items, with no keys. An error item is `VEX_ERROR`. A list in a record or in an argument of an op stays a `vex.list`. The run gives the values of the interpreter in this form. Another value of `lists` gives a reason.
- **[COMPILE.MODULE.LIST.FIELD]** A field of a record can be a list. The record holds the list as a frozen `vex.list`, with the keys of the interpreter as text. An error item has the error `VEX_ERROR`. An op of a domain reads the lists of such a record.
- **[COMPILE.MODULE.KEYS]** `emitModule` and `emitSheetModule` have the option `keys`, with the default `false`. With `keys: true`, the run takes the keys of its records as its last argument: an array with one different text for each record. The value at each position is the value of the interpreter at the key of that position, over a space with these keys. A `get`, a `without`, a `vex.list` and the move `key` use these keys. A key of a literal and of `fill` stays that key. A program that reads no key of a record prints the same text as without the option, and its run ignores the argument. Keys that are not such an array throw a `VexContractError`. A record space has no offset and no axis `window`. Thus a program that reads a key in an array space and has one of these gives a reason. A sheet with formulas of cells gives a reason.
- **[COMPILE.MODULE.BAND]** A module copies the ops of a domain of bands, `BandDomain` of the pilots. A program makes bands, reads their fields, and moves, flips, joins and compares them. The run gives the values of the interpreter, and `VEX_ERROR` for an error.
- **[COMPILE.MODULE.NTH.INDEX]** A module keeps the items with values of a list on its array at the first `nth`, `count` or `first` of the list. Each later `nth`, `count` and `first` of that list does not read the list again. A key of a node of the memo can be a list.
- **[COMPILE.MODULE.LIST.SHARE]** In a module, a list op does not copy a list without error items to read its items with values. It reads the array of the list. No op changes such an array, so `sortBy` sorts a copy.
- **[COMPILE.MODULE.APPEND.OWN]** In a module, a step of a name of `fold` or `iterate` can append to the list of the name. Such a step is a read of the name, `append(step, X)`, `if(c, step, step)` or a `let` with such a step as its body. The other parts of the loop must not read the name. Then the first append copies the list, and each later append adds its items to that copy. Thus n appends cost O(n), not O(n squared). The values and the errors stay the values and the errors of the interpreter.
- **[COMPILE.MODULE.APPEND.LET]** In a module, a step of COMPILE.MODULE.APPEND.OWN can also be a `let` that binds such a step to a new name. No other binding reads the name, and the body does not read the old list. The body can read the new name in each way, and its value can be another list. Then the appends of the binding add their items to the array of the loop. The next append after another list copies that list. The values and the errors stay the values and the errors of the interpreter.
- **[COMPILE.MODULE.APPEND.READ]** In a module, a step of another name can read the name of COMPILE.MODULE.APPEND.OWN when it comes before the step of the name. Each read must be the list of `count`, `nth` or `first`, or the list of the axis `list` of a fold. Then the step of the name still adds its items to the array of the loop. A later step, a read in `until` and each other read keep the copy of each append. The values and the errors stay the values and the errors of the interpreter.
- **[COMPILE.MODULE.SHEET.LIST]** A column of a sheet module can hold a list. A formula reads the list of a cell with the list ops, `get`, `indexOf` and the axis `list`. The results stay the results of `SheetRun`. A column of lists that a formula reads before its own formula needs a `ListKind` in the option `kinds`. Each formula of the column must give a list that fits its kind.
- **[COMPILE.MODULE.SHEET.COMPUTED]** A sheet module takes a read with a computed move, and the results stay the results of `SheetRun`. A read of a finished column reads the array of that column. Another read goes through the search, which finds its cell in the run, also on a cycle that only the values make. A module over a graph gives a reason, because a graph has no window. A list op can read a list at a computed key.
- **[COMPILE.MODULE.GRAPH]** With the option `space: "graph"`, the module is for a graph space. Its run takes the edges after the variables: for each record, an array of the positions of the ends of its edges. The key of a record is the text of its position. Edges that are not an array of positions for each record throw a `VexContractError`. The axes `successors`, `predecessors` and `reachable` give the targets of the interpreter, in its order. An offset and the move `parent` give an error. A window and the axes of a tree give a reason.
- **[COMPILE.MODULE.REDUCE]** A module has `reduce` with a literal op name and the options `strict` and `domain`. Its run gives the value of the interpreter. The first item is the first value. The op of each later step comes from the kinds of the items. No items give the identity of the one domain that has one. The op must give a value of the kind of the items.
- **[COMPILE.MODULE.FORM]** A domain can give a `moduleForm`, the parts that a module copies in place of its own. `Vec2Domain` has one, so a program over `Vec2` values can be a module. A module has no import, so it holds a vector as plain data, the `toJSON` of a `Vec2`. An input can hold plain data or a `Vec2`. The `toJSON` of a value of tier 1 or tier 2 equals the value of the module. An error stays at its key. A form changes no value of tier 1 or tier 2, and it changes no module of a program without its domain.
- **[COMPILE.MODULE.FILL]** A module has `fill` when no domain has the op `fill` (LIST.FILL). Its run gives the values and the errors of the interpreter. The value can be a list, so `fill` can give a list of lists. The keys "0" to "n - 1" are not the keys of records, as for COMPILE.MODULE.LIST. A domain with the op `fill` comes first.
- **[COMPILE.MODULE.FILL.RANGE]** With `fuse`, a module makes no array for `fill(n, v)` when only `count` or a loop over the axis `list` reads the list. The list can also be `take` of such a list, with no option. The loop goes over the count, and each item has its position as its key and `v` as its value. The count has the checks of `fill` and `take`. Thus the values and the errors stay the values and the errors of the interpreter. A name, another op, a key of a node of the memo and a domain with the op `fill` keep the array.
- **[COMPILE.MODULE.SETNTH]** A module has `setNth` over a list, with the option `strict` (LIST.SETNTH). Its run gives the values and the errors of the interpreter. The array of the old list does not change. The value can be a list when the items of the list are lists. A list of lists with a value that is not a list gives a reason. A list of values with a list as the value gives a reason. A missing position or a missing value gives a reason.
- **[COMPILE.MODULE.SORT.BY]** A module has `sortBy` with the option `by` (LIST.SORT.BY). The kinds of the items must decide the op of `by`, and the module copies that op. Its run gives the values of the interpreter. A `by` that is not a literal text, or items whose kinds do not decide the op, give a reason.
- **[COMPILE.MODULE.LOOP.EMPTY]** The first value of a name of a loop can be the empty list. The name then takes the kind of its items from its step, when the program has no module without that kind. A step can get the kind from another such name. Each step must then give items of that kind, or a reason gives the step. A program that no step decides keeps the reason of its first print. A program with a module without that kind keeps its text. Its run gives the values of the interpreter.
- **[COMPILE.MODULE.LIMIT.ONCE]** In a module, a data limit (ITERATE.LIMIT.DATA) that reads no key is a constant of the run. The first key that reaches the limit counts the targets, and each later key reads that count. Thus a loop that stops early pays only for its steps. A key that does not reach the limit does not start the count. The values and the errors stay those of the interpreter (ITERATE.LIMIT.ERROR).
- **[COMPILE.MODULE.LIST.ITEM]** A module has the names `as` of `each` and `fold` over the axis `list` (AXIS.LIST.ITEM, AXIS.LIST.INDEX, AXIS.LIST.SCOPE). Its run gives the values and the errors of the interpreter, also with `reverse`, `where` and `strict`. An item that is a list is a list in the body. A step that reads such a name keeps the append of COMPILE.MODULE.APPEND.OWN.
- **[COMPILE.MODULE.FUSE.OFF]** `emitModule` and `emitSheetModule` have the option `fuse`, with the default `true`. With `fuse: false`, they print the code without fusion. Thus a test and a bench can compare the two forms. A declaration of a print that the printer drops does not stay in that form. A value that is not a boolean gives a reason.
- **[COMPILE.MODULE.FUSE.FACTS]** The printer of a module keeps two facts of each list and the count of the reads of each list node. A list is `clean` when no item holds the error sentinel, and `fresh` when no other part holds its array. The facts are true for each run. With `fuse: false`, they do not change the printed code.
- **[COMPILE.MODULE.FUSE.CLEAN]** With `fuse`, an op over a list that the facts prove clean has no scan for error items and no test of the sentinel. The fact `clean` of each list argument is a part of the signature of a function. The values, the errors and the order of the reads do not change.
- **[COMPILE.MODULE.FUSE]** With `fuse`, `flat` over an `each` whose body is a list is one loop with one output. The module does not print the list of the `each`. A body of `if` pushes from its branch, and `fill(1, v)` pushes `v`. Its run gives the values and the errors of the interpreter. The output is clean and fresh.

  A chain of `append` with a part that pushes is also one output, and each part pushes its items in order. A part that the module keeps for other reads gives its array, and a loop copies its items. In a sheet with a search, a chain that reads a cell keeps its arrays. `sortBy` over a clean and fresh list sorts that array in place, in the stable order of the interpreter.
- **[COMPILE.MODULE.FUSE.ITEM]** In a fused chain, an item that fails adds no item. With `strict`, it is the error of the chain. An error item of a source stays where the interpreter meets it. A strict loop over cells reads each cell before it raises the error.
- **[COMPILE.MODULE.FUSE.ADOPT]** With `fuse`, an append into the list of its name (COMPILE.MODULE.APPEND.OWN) takes a clean and fresh first list as its own array. Thus the first append makes no copy. An append of the result of the loop pushes into the array of the loop when no other part of the result reads the list. A `let` of the result can bind that append to a new name. The values and the errors do not change.
- **[COMPILE.MODULE.FUSE.OUT]** With `fuse`, a value of `emitModule` that does not depend on the key has one `vex.list` for each run. Each key gets that object, so the object is frozen, with its array of items and its nested lists. The module makes the list on its first read. With `fuse: false`, and for a plain array of `lists: "plain"`, each key has its own list, and this list is not frozen. The values and the errors do not change.
- **[COMPILE.MODULE.FUSE.SORT]** With `fuse`, `sortBy` over a clean and fresh list of 64 items or fewer uses an insertion sort. Such a sort does not call the sort of the engine. A longer list calls the sort of the engine one time. The option `by` applies one time to each item, in order, in both forms. The order, the values and the errors stay those of the interpreter (LIST.SORT, LIST.SORT.BY).
- **[COMPILE.MODULE.SIZE]** With `fuse`, the printer removes the code that a run does not need. The values, the errors and the refusals stay those of the module with `fuse: false`. With `fuse: false`, the printer does not remove this code. A text of the program can hold the code that a rule looks for. That text can stop a rule, but no rule changes it.
- **[COMPILE.MODULE.SIZE.FILL]** With `fuse`, `fill(0, x)` prints the empty array when the code of `x` cannot fail. It also prints the empty array when `x` has only literals and ops and the interpreter gives the empty list. Each other `fill` keeps `FI`, so the list keeps its error. A branch of a fused loop with such an empty list prints no block.
- **[COMPILE.MODULE.SIZE.KEY]** With `fuse`, a loop over an array does not print a key that no code reads.
- **[COMPILE.MODULE.SIZE.ALIAS]** With `fuse`, a `const` that gives a second local name to a value is not printed, and each read reads the first name. The `const` stays when a write of the first name can change the value of a read.
- **[COMPILE.MODULE.SIZE.ONCE]** With `fuse`, a lazy cell can print its value at its read. The cell must have one `return` and one read in the form `G(c())`, and that read must run at most once. `G` stays, so a value `E` stays an error.
- **[COMPILE.MODULE.SIZE.INLINE]** With `fuse`, an op or a check of a domain with one call prints its body at the call. Each argument of the call must be a name, and the body must be an expression that reads only its parameters and globals.

- **[COMPILE.MODULE.FAULT]** The option `faults` of a module selects what a catch does with an exception. With `value`, the default, each exception at a binding, an item or a key is the error of Vex. With `throw`, an exception that starts in a function of a domain is the error of Vex, as in the interpreter. Each other exception leaves the run. Thus a fault of the printed code does not become a value. A text of the program that holds a catch stays that text.
- **[COMPILE.MODULE.BYTES]** A committed module equals its print byte for byte. A pinned commit of the compiler gives the print, and a difference fails the gate of the repository of the module. The message gives the first line that differs and the command that prints the file again. The check of a pull request reads no published version, so its result depends only on the pull request. A daily check prints from the last release and fails when the output differs from the files.
- **[COMPILE.GROWTH]** The gate has shapes, each at two legal sizes. The time of a print grows with its places at most by the exponent of the gate. The text of a module grows at most linearly. The shapes `origin` and `wideorigin` state their own limits and reasons. The gate is `packages/compiler/bench/growth.ts`.
- **[COMPILE.SOURCE.SIZE]** A line of the source of tier 2 has no indent, so the block nesting of a line does not change its size. A let with no function keeps the map of functions of the lowering. The gate `packages/compiler/bench/growth.ts` reads the time and the bytes of tier 2 for each shape, against the places. A bytes exponent over its limit fails the gate, and the limit of each shape finds 5 % more bytes at its large size. A row with different bytes in its processes is report only on its bytes. The time is report only.
- **[COMPILE.MODULE.COST]** The time of a print of each module of ireko stays under its limit against a fixed base commit. The gate reads each module alone, and its row `build` reads the modules with a shared object in one process. The program of a module picks its limit, and a line of a module states its reason. The rule is `tailLimitVerdict` of `@mark1russell7/rigor-bench`. A second pair is a fault only over its limit and over the worst second pair of the A/A arm of the run. A read with an A/A arm over the cap does not decide. The gate is `packages/pilots/bench/module-cost.ts`, and it must fail a known added cost. It must also fail a cost in 2 of the 7 rounds that leaves the median under its limit. A pass states that no module has a slowdown over its limit. A pass does not state that a module is not slower. The limits are 1.10 to 1.23, `bounds` has 1.25, and the gain rows `build` and `avoid` have 0.98 and 0.89 on the models of `GAIN_MODELS`.
- **[COMPILE.MODULE.RECORD]** Each read of the gate of `COMPILE.MODULE.COST` writes one JSON line for each row. Each line names its format, its kind (`gate` or `fault`), its step, the facts of the processor and if its read decided. A read of a cost takes only the decided rows of the kind `gate`. A line with another format or no known kind is a fault.
- **[COMPILE.PLACES]** A compile counts the places of a program first. A place is a node at one position of the tree of the program, so a shared object counts once for each place. A module and tier 2 refuse a program with more than 32,768 places. The error has the code `COMPILE.PLACES`, the count and the limit. The interpreter has no such limit, so tier 1 runs a program that a compile refuses. This is a stated difference between the interpreter and a compile.
- **[COMPILE.MODULE.TEXT]** The bytes of a module do not depend on the program that loaded the compiler or the domains. The module parses the text of each copied function and prints the tree. A text that is not one expression stays as it is.
- **[COMPILE.MODULE.SIZE.FLAT]** With `fuse`, a module has list helpers with no argument for the depth when each list field of the schema has the depth 0.
- **[COMPILE.MODULE.SIZE.DEAD]** With `fuse`, a module has no helper, op or constant of the run that no code reads.
- **[COMPILE.MODULE.NAME]** The option `name` gives the name of the export of the run. A reserved word, `VEX_ERROR` and `VexContractError` are not names of the run. Each other identifier is a good name. A run name hides nothing from the code of the module or from a copy of an op. If the code has the name as a token, the module prints the run under an internal name. The code does not have that name, and the module exports the run with `as`. Else the module prints `export function`.
- **[COMPILE.MODULE.SCAN]** A `fold` over `where(all, test)` can be a scan. Its test compares a value `T` of the target with a key of the origin by `<` or `<=`. Its first values, its steps and its result must read no key of the origin. Then a run evaluates `T` once and each step at most once at each record. The values and the errors stay the values and the errors of the interpreter.
- **[COMPILE.MODULE.EXIT]** In a module, a name of `fold` whose step is `and(name, ...)` stops at false, and `or(name, ...)` stops at true. When each such name stops, the loop leaves. The rest of the targets runs only the checks, the tests and the steps of the other names. Thus the values and the errors stay the values and the errors of the interpreter. A fold with an append into its own list has no exit.
- **[COMPILE.MODULE.PAIRS]** A module prints the steps of a `fold` over `all` again, with no test and no name that holds a list. Each read of a column at the focus of the fold, or of a loop in its steps, reads the pack of the column. A column of a call of the printed function has a pack in each call. The values and the errors do not change.
- **[COMPILE.SOURCE]** `generate(e)` gives the same source for the same expression. The source has no name and no literal of the expression. It reads them from its constants, by index.

## 11. Examples

- **[EXAMPLE.SEPARATION]** The test is `position + size - other.position` in a pair of boxes. A component that is not positive shows that the box at the origin ends before the other box starts.
- **[EXAMPLE.NEAREST]** The minimum of the distances from the origin to the others is the distance to the nearest other record.
- **[EXAMPLE.OFFSETS]** The reduction with `add` of the offsets from the origin to the others is the sum of the offsets.
- **[EXAMPLE.TREE]** In a tree of people, the salary of a person plus the sum over `descendants` is the cost of the team of that person. The `count` over `ancestors` is the depth of the person.
- **[EXAMPLE.SCHEMA]** A program of `JsonDomain` finds the schema of up to 20 JSON documents. It gives one record for each field path, in the order that the paths first occur. A record has the path, the distinct kinds and the count of the documents with the path. The program goes into an object that is not empty at a depth under 3, and it does not go into an array.

## 12. The mutation lane

- **[LANE.GATE]** A full run reads each part of the lane, and each published package has a score of 95 % or more. A time-out of the clock counts as not found. A part with no report gives no read, and a no read fails the gate.
- **[LANE.PARTS]** The parts of a package cover each file of the package once, and the parts of a file cover each line once. Each input gives the same parts.
- **[LANE.DELAY]** The full run starts each week. A night reads only the changed files, and a score of a night fails nothing. A fault with no change in its own file shows at the next full run, at most 7 days later. A page with a score states the date of its run, and a score older than 7 days reads stale.
- **[LANE.DRYRUN]** A change of the files of the lane starts the first test run of Stryker on each part. A part that fails this run fails the check, and it gives no score.
- **[LANE.PLAIN]** A test file of the compiler with imports that reach the printer reads the copy of the domains that Stryker does not mutate. Each other test file of the compiler reads the mutated copy. The lane refuses a file that this rule cannot classify, and a test that reads two copies.
