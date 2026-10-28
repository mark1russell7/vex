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
- **[DOC.CONSTRUCT]** The constructs `let`, `fn`, `record`, `each`, `fold` and `iterate` have the fields of the table, and no other fields. Only `at`, `as` and `until` are optional. `as` is a list of one or two names. It needs the axis `list`, also inside `reverse` and `where`. Its two names are not the same, and a name of `init` is not a name of `as`. `limit` and `params` are data, not terms.
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
- **[ITERATE.LIMIT]** `iterate` makes `limit` steps at the position of the node. `limit` is a whole number from 0 to 100000 in the expression.
- **[ITERATE.UNTIL]** With `until`, the test evaluates before each step and after the last step. A true test stops the iteration. With no true test, the value is `#NUM!`. A test that is not a boolean gives `#VALUE!`.
- **[ITERATE.ERROR]** The first error of a value, of the test or of `result` is the value of the iteration.
- **[LOOP.LIST]** A name of `fold` or `iterate` can hold a list (LIST.VALUE). A step gives a new list from the values before the step, for example with `append`, `drop` and `without`. Thus a list can be the stack or the seen set of a search, or the positions of a layout. A step reads the old value at a key with `get` (LIST.GET).

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
- **[BUILD.LIST.ITEM]** In `each` of a list chain, the body also gets a chain of the item and a chain of its index (AXIS.LIST.ITEM, AXIS.LIST.INDEX). In a fold over the axis `list`, the step also gets the index after the item. The builder writes `as` only with the names that the body or the step reads. A loop inside a body or a step gets other names. Another axis has no index, so a step that reads it makes the builder throw a `TypeError`.
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

- **[SHEET.CELL]** A cell reference resolves its address from the focus, then gives the result of that cell. An unknown column gives `#NAME?`, and an address outside the space gives `#REF!`. The address of a cell reference has only fixed moves.
- **[SHEET.CELL.FORMULA]** A cell can have its own formula. That formula replaces the formula of its column at its key, and the other keys keep the formula of the column. A cell without a formula gives `#NAME?`. In the builder, `cellFormula(k, column, formula)` gives the formula of a cell, and the formula must give a value of the type of the column.
- **[SHEET.TABLES]** A run can have more tables, each with a name, a space, columns and formulas of cells. A cell reference reads the table of the space where it evaluates, so the body of the axis `table(name)` reads the cells of that table. Each cell of each table evaluates once, and a cycle across tables gives `#CYCLE!`.
- **[SHEET.RECURRENCE]** A column can read itself at another key. A recurrence over the key order, for example a running total, gives the same result as a loop. The first key that a host reads does not change a result, also at the end of a long recurrence.
- **[SHEET.DECLARE]** `declare<T>()` gives the types of columns before their formulas. A formula can read a declared column with its type, also the column itself or a later column. The formula of a declared column must give a value of the declared type. `declare` has no effect at run time.
- **[SHEET.CYCLE]** Each cell on a cycle of cell references gives `#CYCLE!`. A cycle can contain one cell, or cells at different keys.
- **[SHEET.DEEP]** A run evaluates a chain of cell references of any length. The length does not depend on the call stack of the engine, and the results are the results of a recursive search.
- **[SHEET.ORDER]** The result of a cell does not depend on the order of the evaluations. `ifError` does not hide a cycle from the cells on that cycle.
- **[SHEET.FILL]** `fill(table)` evaluates each cell of a table before the reads. Each column comes after the columns that it reads, and the keys of a column follow its reads from itself. A read then gives the result of a read without the fill.
- **[SHEET.COMPILE]** A run with the option `compile` evaluates each formula of a column with a compiled program. It gives the results of a run without the option. A formula compiles once for each compiler and its options, also across runs. A compiled program reads the cells of the run that evaluates it.

## 10. The compiler

These requirements apply to `@mark1russell7/vex-compiler`.

- **[COMPILE.TIERED]** `tiered(e, options)` gives a program with the interface of `compile`. For each space, origin, variables and tables, its `run` gives the result of `evaluate`.
- **[COMPILE.FALLBACK]** Where the generated code of tier 2 cannot give the result, tier 1 gives it. Each error value comes from tier 1. A page that does not permit `new Function` uses tier 1.
- **[COMPILE.TRACE]** A run with a trace, and `explain`, use tier 1. Thus they give the traces of the interpreter.
- **[COMPILE.MEMO]** A program keeps the value of each node that depends only on the space, for each space. Thus a run at each key of a space evaluates such a node once. A space does not change, so each run gives the result of `evaluate`.
- **[COMPILE.GROUP]** A program keeps the value of a node for each space and each value of its keys. A key reads the origin or a name from outside the node, and nothing that the node changes. Thus an aggregate over the group of the origin evaluates once for each group.
- **[KIND.STATIC]** When the kinds of the values of an op site decide its op, the site uses that op with no guard. A value against the schema, or a result against a primitive kind of `returns`, sends the evaluation to tier 1. A result of the kind of a domain gets the checks of the interpreter.
- **[KIND.DOMAIN]** A value of a domain without a primitive type has the kind of its domain, `domain:Name`. An op with `returns: "domain"` gives this kind, and a schema can declare it for a field. A module checks such a field with a copy of `is` of the domain. It checks each copy of an op with the `samples` of the domain.
- **[COMPILE.MODULE]** `emitModule(e, options)` gives an ES module with no import of Vex. For an input that keeps the schema, its run gives the value of the interpreter at each key, or `VEX_ERROR` for an error. An input against the schema throws a `VexContractError`. The option `name` is the name of the run. A reserved word, a name that the module declares or a global that a module reads gives a reason.
- **[COMPILE.MODULE.TREE]** With the option `space: "tree"`, the module is for a tree space. Its run takes the parents after the variables: the position of the parent of each record, or -1 for a root. The key of a record is the text of its position. A parent that is not -1 or a position, or a cycle of parents, throws a `VexContractError`. The move `parent`, the offsets, the window and the axes of a tree and of a graph give the targets of the interpreter.
- **[COMPILE.MODULE.SHEET]** `emitSheetModule(columns, options)` prints the formula columns of a sheet as a standalone module. Its run gives an object with an array for each column: the result at each key, or `VEX_ERROR`. These results are the results of `SheetRun` with the same formulas of cells and the same budget of the stack. Thus each cell on a cycle gives `VEX_ERROR`. The run fills the columns in the static order of `SheetRun.fill`. A formula that reads a column before the formula of that column needs the kind of that column in the option `kinds`.
- **[COMPILE.MODULE.SHEET.DIRECT]** A sheet module without formulas of cells has no search when each read of a cell reads a finished cell. A read of a column before its own column in the fill order reads a finished cell. A read of its own column reads a finished cell in three forms. These are the parent in a pre-order tree fill, the children in a post-order tree fill and one earlier key in a forward array fill. The results stay the results of `SheetRun`.
- **[COMPILE.MODULE.ONCE]** A sheet module with no search has no function for a column. The code of each formula is in a loop over the keys, and the results stay the results of `SheetRun`. Columns that follow each other in the fill order share one loop when they have the same order of the keys. Each read of an earlier column of the loop must read the key itself or one of the three forms of COMPILE.MODULE.SHEET.DIRECT.
- **[COMPILE.MODULE.LIST]** A module has the list ops `drop`, `append`, `without`, `flat`, `get` and `indexOf`. It has list literals, a list op over a `let` and lists as names of `fold` and `iterate`. Its run gives the values of the interpreter. A step must give a list of the kind of the first list of its name. The axis `list` over a list with the keys of a literal or of `fill` reads no record at a target. A read of a record at such a target gives a reason.
- **[COMPILE.MODULE.LIST.RESULT]** The value of a module can be a list, also a list of lists. The run gives it as a `vex.list` with the keys of the interpreter as text. An error item has the error `VEX_ERROR`. `if` and `ifError` take lists as branches. A list in only one branch gives a reason.
- **[COMPILE.MODULE.LIST.ARG]** An argument of an op after its receiver can be a list. The op gets a frozen `vex.list`, as in the interpreter. An error item has the error `VEX_ERROR`. A parameter that takes no list gives the error of the interpreter. An argument of a call can be a list too. A list as the receiver of an op that is not a list op of the module gives a reason.
- **[COMPILE.MODULE.LIST.CALL]** The value of a call can be a list. The place of the call takes it as a list, also the list ops, the axis `list`, a field and an argument. Each kind of the arguments has its own function and the facts of its list. A list of a call at a place that takes no list gives a reason.
- **[COMPILE.MODULE.LIST.INPUT]** A field of the schema can have a `ListKind`, also a list of lists and a list of `domain:<Name>`. The record holds the list as a `vex.list`. The program uses the field as a list, and the run gives the values of the interpreter. Another value, an item of another kind and an error item of `#DEPTH!` throw a `VexContractError`. The axis `list` cannot read a record at a key of such a list.
- **[COMPILE.MODULE.LIST.FIELD]** A field of a record can be a list. The record holds the list as a frozen `vex.list`, with the keys of the interpreter as text. An error item has the error `VEX_ERROR`. An op of a domain reads the lists of such a record.
- **[COMPILE.MODULE.BAND]** A module copies the ops of a domain of bands, `BandDomain` of the pilots. A program makes bands, reads their fields, and moves, flips, joins and compares them. The run gives the values of the interpreter, and `VEX_ERROR` for an error.
- **[COMPILE.MODULE.NTH.INDEX]** A module keeps the items with values of a list on its array at the first `nth`, `count` or `first` of the list. Each later `nth`, `count` and `first` of that list does not read the list again. A key of a node of the memo can be a list.
- **[COMPILE.MODULE.APPEND.OWN]** In a module, a step of a name of `fold` or `iterate` can append to the list of the name. Such a step is a read of the name, `append(step, X)`, `if(c, step, step)` or a `let` with such a step as its body. The other parts of the loop must not read the name. Then the first append copies the list, and each later append adds its items to that copy. Thus n appends cost O(n), not O(n squared). The values and the errors stay the values and the errors of the interpreter.
- **[COMPILE.MODULE.SHEET.LIST]** A column of a sheet module can hold a list. A formula reads the list of a cell with the list ops, `get`, `indexOf` and the axis `list`. The results stay the results of `SheetRun`. A column of lists that a formula reads before its own formula needs a `ListKind` in the option `kinds`. Each formula of the column must give a list that fits its kind.
- **[COMPILE.MODULE.GRAPH]** With the option `space: "graph"`, the module is for a graph space. Its run takes the edges after the variables: for each record, an array of the positions of the ends of its edges. The key of a record is the text of its position. Edges that are not an array of positions for each record throw a `VexContractError`. The axes `successors`, `predecessors` and `reachable` give the targets of the interpreter, in its order. An offset and the move `parent` give an error. A window and the axes of a tree give a reason.
- **[COMPILE.MODULE.REDUCE]** A module has `reduce` with a literal op name and the options `strict` and `domain`. Its run gives the value of the interpreter. The first item is the first value. The op of each later step comes from the kinds of the items. No items give the identity of the one domain that has one. The op must give a value of the kind of the items.
- **[COMPILE.MODULE.FILL]** A module has `fill` when no domain has the op `fill` (LIST.FILL). Its run gives the values and the errors of the interpreter. The value can be a list, so `fill` can give a list of lists. The keys "0" to "n - 1" are not the keys of records, as for COMPILE.MODULE.LIST. A domain with the op `fill` comes first.
- **[COMPILE.MODULE.SORT.BY]** A module has `sortBy` with the option `by` (LIST.SORT.BY). The kinds of the items must decide the op of `by`, and the module copies that op. Its run gives the values of the interpreter. A `by` that is not a literal text, or items whose kinds do not decide the op, give a reason.
- **[COMPILE.MODULE.LIST.ITEM]** A module has the names `as` of `each` and `fold` over the axis `list` (AXIS.LIST.ITEM, AXIS.LIST.INDEX, AXIS.LIST.SCOPE). Its run gives the values and the errors of the interpreter, also with `reverse`, `where` and `strict`. An item that is a list is a list in the body. A step that reads such a name keeps the append of COMPILE.MODULE.APPEND.OWN.
- **[COMPILE.SOURCE]** `generate(e)` gives the same source for the same expression. The source has no name and no literal of the expression. It reads them from its constants, by index.

## 11. Examples

- **[EXAMPLE.SEPARATION]** The test is `position + size - other.position` in a pair of boxes. A component that is not positive shows that the box at the origin ends before the other box starts.
- **[EXAMPLE.NEAREST]** The minimum of the distances from the origin to the others is the distance to the nearest other record.
- **[EXAMPLE.OFFSETS]** The reduction with `add` of the offsets from the origin to the others is the sum of the offsets.
- **[EXAMPLE.TREE]** In a tree of people, the salary of a person plus the sum over `descendants` is the cost of the team of that person. The `count` over `ancestors` is the depth of the person.
- **[EXAMPLE.SCHEMA]** A program of `JsonDomain` finds the schema of up to 20 JSON documents. It gives one record for each field path, in the order that the paths first occur. A record has the path, the distinct kinds and the count of the documents with the path. The program goes into an object that is not empty at a depth under 3, and it does not go into an array.
