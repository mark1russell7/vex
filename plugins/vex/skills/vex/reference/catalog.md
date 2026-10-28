# The catalog of the domains

The function `catalogText` of `packages/mcp` makes this file from the domain objects of `@mark1russell7/vex-domains`, and its test writes it. The MCP tool `vex_catalog` gives the same text. Do not change it by hand.

- An op applies to a receiver, the first argument. The first domain in `vex(...)` whose `is` accepts the receiver gives the op.
- In the builder, write `value._.op(...rest)`. In the IR, write `app("op", receiver, ...rest)`.
- "Lifts numbers" means that a number argument becomes a value of the domain, for example 2 becomes the vector (2, 2).
- "Laws" are the claims of the op. The law checker of `@mark1russell7/vex-testkit` tests them.
- "Identity" is the value of `reduce` over an empty list.
- "not declared" means that the op does not declare the kinds of its result or of its parameters.

## The ops of the core

These ops apply to each value. They are not ops of a domain.

| Op | What it gives |
|---|---|
| `if(test, then, otherwise)` | `then` or `otherwise`. Only the selected branch evaluates. |
| `and(...)`, `or(...)` | A boolean. The evaluation stops at the first value that decides. |
| `ifError(value, fallback)` | `fallback` when `value` gives an error. It does not hide `#DEPTH!`. |
| `count`, `values`, `keys`, `errors`, `first` | A fact of a list, for each kind of item |
| `sum`, `mean`, `min`, `max` | A number from a list of numbers. Other items give an error. |
| `any`, `all`, `none` | A boolean from a list of booleans |
| `reduce(list, op)` | The left fold of the list with the op of the domain of the items, for example `reduce(sizes, "max")` |
| `sortBy(list)` | A list with the items in the order of their values, from the smallest. The values are numbers or texts. |
| `sortBy(list, { by })` | A list with the items in the order of the results of the op `by` on their values, for example `sortBy(bands, { by: "from" })`. The results are numbers or texts. |
| `take(list, n)` | A list of the first `n` items |
| `nth(list, i)` | The value of the item at the position `i`, from 0 |
| `drop(list, n)` | A list of the items after the first `n` items |
| `append(list, other)` | A list of the items of `list`, and then the items of `other` |
| `without(list, other)` | A list of the items of `list` whose key is not the key of an item of `other` |
| `flat(list)` | A list of the items of the lists that are the values of the items, in order |
| `get(list, key)` | The value of the first item with the key `key`. A key that no item has gives `#N/A`. |
| `indexOf(list, value)` | The position of the first item with the value, from 0, as `nth` counts. The value is a number, a text or a boolean. A value that no item has gives `#N/A`. |
| `fill(n, value)` | A list of `n` items with the value, from 0 to 100000 items. The keys are the positions. |

A list op skips error items. The option `{ strict: true }` gives the first error. A literal can be a list, for example the empty list `{ "kind": "vex.list", "items": [] }`, and a name of a loop can hold a list.

An array of a field or of a name is a list where a list op or the axis `list` needs one. The keys are the positions, from `"0"`. Thus `count(fr)`, `nth(fr, 1)` and `take(fr, 2)` read the array `fr`. A domain or a function of the host with the op comes first.

## The names of a loop over a list

Over the axis `list`, the field `as: [item]` or `as: [item, index]` of `each` and `fold` names the value of each item, and then its position from 0. The body of `each` and the steps of `fold` see these names. The test of `where`, `init` and `result` do not see them. For example, `each(axes.list(v("sizes")), app("multiply", v("w"), v("i")), undefined, ["w", "i"])` gives each size times its position. In the builder, the body of `each` of a list chain gets the item and the index after the chain of the target: `sizes.each((c, w, i) => w._.multiply(i))`. The step of `fold` gets the index after the item.

## `NumDomain`

Numbers. A result that is not finite gives `#NUM!`. The values are of the type `number`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `add` | `add(number, number)` | number |  | commutative, associative | 0 |
| `subtract` | `subtract(number, number)` | number |  |  |  |
| `multiply` | `multiply(number, number)` | number |  | commutative, associative | 1 |
| `divide` | `divide(number, number)` | number |  |  |  |
| `mod` | `mod(number, number)` | number |  |  |  |
| `pow` | `pow(number, number)` | number |  |  |  |
| `min` | `min(number, number)` | number |  | commutative, associative, idempotent |  |
| `max` | `max(number, number)` | number |  | commutative, associative, idempotent |  |
| `clamp` | `clamp(number, number, number)` | number |  |  |  |
| `abs` | `abs(number)` | number |  |  |  |
| `negate` | `negate(number)` | number |  |  |  |
| `sqrt` | `sqrt(number)` | number |  |  |  |
| `ln` | `ln(number)` | number |  |  |  |
| `exp` | `exp(number)` | number |  |  |  |
| `log10` | `log10(number)` | number |  |  |  |
| `sin` | `sin(number)` | number |  |  |  |
| `cos` | `cos(number)` | number |  |  |  |
| `asin` | `asin(number)` | number |  |  |  |
| `hypot` | `hypot(number, number)` | number |  | commutative |  |
| `date` | `date(number, number, number)` | LocalDate |  |  |  |
| `vec2` | `vec2(number, number)` | Vec2 |  |  |  |
| `xy` | `xy(number, number)` | XY |  |  |  |
| `floor` | `floor(number)` | number |  |  |  |
| `ceil` | `ceil(number)` | number |  |  |  |
| `round` | `round(number)` | number |  |  |  |
| `gt` | `gt(number, number)` | boolean |  |  |  |
| `gte` | `gte(number, number)` | boolean |  |  |  |
| `lt` | `lt(number, number)` | boolean |  |  |  |
| `lte` | `lte(number, number)` | boolean |  |  |  |
| `eq` | `eq(number, number)` | boolean |  | commutative |  |

## `BoolDomain`

Booleans. The values are of the type `boolean`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `and` | `and(boolean, boolean)` | boolean |  | commutative, associative, idempotent | true |
| `or` | `or(boolean, boolean)` | boolean |  | commutative, associative, idempotent | false |
| `xor` | `xor(boolean, boolean)` | boolean |  | commutative, associative | false |
| `not` | `not(boolean)` | boolean |  |  |  |
| `eq` | `eq(boolean, boolean)` | boolean |  | commutative |  |

## `TextDomain`

Texts. The values are of the type `string`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `concat` | `concat(string, value)` | string |  |  |  |
| `length` | `length(string)` | number |  |  |  |
| `upper` | `upper(string)` | string |  |  |  |
| `lower` | `lower(string)` | string |  |  |  |
| `trim` | `trim(string)` | string |  |  |  |
| `contains` | `contains(string, string)` | boolean |  |  |  |
| `eq` | `eq(string, string)` | boolean |  | commutative |  |

## `Vec2Domain`

2D vectors: `new Vec2(x, y)`, or `vec2` of `NumDomain`. A component that is not finite gives `#NUM!`. The values are of the type `Vec2`. A number lifts to a value of the domain.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `x` | `x(Vec2)` | number |  |  |  |
| `y` | `y(Vec2)` | number |  |  |  |
| `add` | `add(Vec2, Vec2)` | Vec2 | yes | commutative, associative | (0, 0) |
| `subtract` | `subtract(Vec2, Vec2)` | Vec2 | yes |  |  |
| `multiply` | `multiply(Vec2, Vec2)` | Vec2 | yes | commutative, associative | (1, 1) |
| `divide` | `divide(Vec2, Vec2)` | Vec2 | yes |  |  |
| `min` | `min(Vec2, Vec2)` | Vec2 | yes | commutative, associative, idempotent |  |
| `max` | `max(Vec2, Vec2)` | Vec2 | yes | commutative, associative, idempotent |  |
| `scale` | `scale(Vec2, number)` | Vec2 |  |  |  |
| `negate` | `negate(Vec2)` | Vec2 |  |  |  |
| `halve` | `halve(Vec2)` | Vec2 |  |  |  |
| `abs` | `abs(Vec2)` | Vec2 |  |  |  |
| `round` | `round(Vec2)` | Vec2 |  |  |  |
| `floor` | `floor(Vec2)` | Vec2 |  |  |  |
| `ceil` | `ceil(Vec2)` | Vec2 |  |  |  |
| `clamp` | `clamp(Vec2, number, number)` | Vec2 |  |  |  |
| `swap` | `swap(Vec2)` | Vec2 |  |  |  |
| `compose` | `compose(Vec2, number, number)` | Vec2 |  |  |  |
| `select` | `select(Vec2, Vec2, Vec2)` | Vec2 | yes |  |  |
| `rotate` | `rotate(Vec2, number)` | Vec2 |  |  |  |
| `normalize` | `normalize(Vec2)` | Vec2 |  |  |  |
| `lerp` | `lerp(Vec2, Vec2, number)` | Vec2 |  |  |  |
| `length` | `length(Vec2)` | number |  |  |  |
| `lengthSq` | `lengthSq(Vec2)` | number |  |  |  |
| `distance` | `distance(Vec2, Vec2)` | number |  |  |  |
| `dot` | `dot(Vec2, Vec2)` | number |  | commutative |  |
| `along` | `along(Vec2, Vec2)` | number |  |  |  |
| `across` | `across(Vec2, Vec2)` | number |  |  |  |
| `cross` | `cross(Vec2, Vec2)` | number |  |  |  |
| `angle` | `angle(Vec2)` | number |  |  |  |
| `area` | `area(Vec2)` | number |  |  |  |
| `sum` | `sum(Vec2)` | number |  |  |  |
| `minComponent` | `minComponent(Vec2)` | number |  |  |  |
| `maxComponent` | `maxComponent(Vec2)` | number |  |  |  |
| `equals` | `equals(Vec2, Vec2)` | boolean |  | commutative |  |
| `anyNonPositive` | `anyNonPositive(Vec2)` | boolean |  |  |  |
| `allPositive` | `allPositive(Vec2)` | boolean |  |  |  |
| `anyNegative` | `anyNegative(Vec2)` | boolean |  |  |  |
| `allNonNegative` | `allNonNegative(Vec2)` | boolean |  |  |  |
| `anyZero` | `anyZero(Vec2)` | boolean |  |  |  |
| `allZero` | `allZero(Vec2)` | boolean |  |  |  |
| `anyLessThan` | `anyLessThan(Vec2, number)` | boolean |  |  |  |
| `allLessThan` | `allLessThan(Vec2, number)` | boolean |  |  |  |
| `anyGreaterThan` | `anyGreaterThan(Vec2, number)` | boolean |  |  |  |
| `allGreaterThan` | `allGreaterThan(Vec2, number)` | boolean |  |  |  |

## `XYDomain`

2D vectors as plain data: `{ x, y }`, or `xy` of `NumDomain`. Each op is a function, so a standalone module can copy the domain. No op lifts a number. Put it before `NumRecordDomain`. The values are of the type `XY`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `x` | `x(XY)` | number |  |  |  |
| `y` | `y(XY)` | number |  |  |  |
| `add` | `add(XY, XY)` | XY |  | commutative, associative | (0, 0) |
| `subtract` | `subtract(XY, XY)` | XY |  |  |  |
| `multiply` | `multiply(XY, XY)` | XY |  | commutative, associative | (1, 1) |
| `divide` | `divide(XY, XY)` | XY |  |  |  |
| `min` | `min(XY, XY)` | XY |  | commutative, associative, idempotent |  |
| `max` | `max(XY, XY)` | XY |  | commutative, associative, idempotent |  |
| `scale` | `scale(XY, number)` | XY |  |  |  |
| `negate` | `negate(XY)` | XY |  |  |  |
| `abs` | `abs(XY)` | XY |  |  |  |
| `floor` | `floor(XY)` | XY |  |  |  |
| `ceil` | `ceil(XY)` | XY |  |  |  |
| `round` | `round(XY)` | XY |  |  |  |
| `dot` | `dot(XY, XY)` | number |  | commutative |  |
| `length` | `length(XY)` | number |  |  |  |
| `distance` | `distance(XY, XY)` | number |  | commutative |  |
| `area` | `area(XY)` | number |  |  |  |
| `sum` | `sum(XY)` | number |  |  |  |
| `equals` | `equals(XY, XY)` | boolean |  | commutative |  |

## `NDVectorDomain`

Vectors with named components. A component that one vector does not have counts as 0. No op lifts a number. The values are of the type `NDVector`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `add` | `add(NDVector, NDVector)` | NDVector |  | commutative, associative | NDVector({}) |
| `subtract` | `subtract(NDVector, NDVector)` | NDVector |  |  |  |
| `multiply` | `multiply(NDVector, NDVector)` | NDVector |  | commutative, associative |  |
| `min` | `min(NDVector, NDVector)` | NDVector |  | commutative, associative, idempotent |  |
| `max` | `max(NDVector, NDVector)` | NDVector |  | commutative, associative, idempotent |  |
| `mergePreferNonZero` | `mergePreferNonZero(NDVector, NDVector)` | NDVector |  | associative, idempotent |  |
| `scale` | `scale(NDVector, number)` | NDVector |  |  |  |
| `clamp` | `clamp(NDVector, number, number)` | NDVector |  |  |  |
| `dot` | `dot(NDVector, NDVector)` | number |  | commutative |  |
| `length` | `length(NDVector)` | number |  |  |  |
| `norm1` | `norm1(NDVector)` | number |  |  |  |
| `normInf` | `normInf(NDVector)` | number |  |  |  |
| `equals` | `equals(NDVector, NDVector)` | boolean |  | commutative |  |
| `pick` | `pick(NDVector, …)` | not declared |  |  |  |
| `withKeys` | `withKeys(NDVector, …)` | not declared |  |  |  |
| `get` | `get(NDVector, string)` | number |  |  |  |
| `set` | `set(NDVector, string, number)` | NDVector |  |  |  |

## `LiftedNDVectorDomain`

The vectors of `NDVectorDomain`, but a number argument of `add`, `subtract`, `multiply` or `dot` becomes `{ scalar: n }`. The values are of the type `NDVector`. A number lifts to a value of the domain.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `add` | `add(NDVector, NDVector)` | NDVector | yes | commutative, associative | NDVector({}) |
| `subtract` | `subtract(NDVector, NDVector)` | NDVector | yes |  |  |
| `multiply` | `multiply(NDVector, NDVector)` | NDVector | yes | commutative, associative |  |
| `min` | `min(NDVector, NDVector)` | NDVector |  | commutative, associative, idempotent |  |
| `max` | `max(NDVector, NDVector)` | NDVector |  | commutative, associative, idempotent |  |
| `mergePreferNonZero` | `mergePreferNonZero(NDVector, NDVector)` | NDVector |  | associative, idempotent |  |
| `scale` | `scale(NDVector, number)` | NDVector |  |  |  |
| `clamp` | `clamp(NDVector, number, number)` | NDVector |  |  |  |
| `dot` | `dot(NDVector, NDVector)` | number | yes | commutative |  |
| `length` | `length(NDVector)` | number |  |  |  |
| `norm1` | `norm1(NDVector)` | number |  |  |  |
| `normInf` | `normInf(NDVector)` | number |  |  |  |
| `equals` | `equals(NDVector, NDVector)` | boolean |  | commutative |  |
| `pick` | `pick(NDVector, …)` | not declared |  |  |  |
| `withKeys` | `withKeys(NDVector, …)` | not declared |  |  |  |
| `get` | `get(NDVector, string)` | number |  |  |  |
| `set` | `set(NDVector, string, number)` | NDVector |  |  |  |

## `NumRecordDomain`

Plain records of finite numbers, for example from `rec`. `toNDVector` makes a vector. The values are of the type `record of numbers`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `toNDVector` | `toNDVector(record of numbers)` | NDVector |  |  |  |

## `ColorDomain`

RGB colors, with the WCAG ops of contrast. The values are of the type `Color`. A number lifts to a value of the domain.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `add` | `add(Color, Color)` | Color |  | commutative, associative | rgba(0, 0, 0, 0) |
| `multiply` | `multiply(Color, number)` | Color |  |  |  |
| `clamp` | `clamp(Color, number, number)` | Color |  |  |  |
| `mix` | `mix(Color, Color, number)` | Color |  |  |  |
| `luminance` | `luminance(Color)` | number |  |  |  |
| `relativeLuminance` | `relativeLuminance(Color)` | number |  |  |  |
| `contrast` | `contrast(Color, Color)` | number |  | commutative |  |
| `equals` | `equals(Color, Color)` | boolean |  | commutative |  |

## `AngleDomain`

Angles. The values are of the type `Angle`. A number lifts to a value of the domain.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `add` | `add(Angle, Angle)` | Angle | yes | commutative, associative | 0 rad |
| `subtract` | `subtract(Angle, Angle)` | Angle | yes |  |  |
| `scale` | `scale(Angle, number)` | Angle |  |  |  |
| `normalize` | `normalize(Angle)` | Angle |  |  |  |
| `toVec2` | `toVec2(Angle, number)` | Vec2 |  |  |  |
| `sin` | `sin(Angle)` | number |  |  |  |
| `cos` | `cos(Angle)` | number |  |  |  |
| `degrees` | `degrees(Angle)` | number |  |  |  |

## `DateDomain`

Days of the calendar, without a time. `date` of `NumDomain` makes a date. The values are of the type `LocalDate`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `add` | `add(LocalDate, number)` | LocalDate |  |  |  |
| `subtract` | `subtract(LocalDate, value)` | number |  |  |  |
| `addMonths` | `addMonths(LocalDate, number)` | LocalDate |  |  |  |
| `endOfMonth` | `endOfMonth(LocalDate, number)` | LocalDate |  |  |  |
| `year` | `year(LocalDate)` | number |  |  |  |
| `month` | `month(LocalDate)` | number |  |  |  |
| `day` | `day(LocalDate)` | number |  |  |  |
| `weekday` | `weekday(LocalDate)` | number |  |  |  |
| `gt` | `gt(LocalDate, LocalDate)` | boolean |  |  |  |
| `gte` | `gte(LocalDate, LocalDate)` | boolean |  |  |  |
| `lt` | `lt(LocalDate, LocalDate)` | boolean |  |  |  |
| `lte` | `lte(LocalDate, LocalDate)` | boolean |  |  |  |
| `eq` | `eq(LocalDate, LocalDate)` | boolean |  | commutative |  |

## `JsonDomain`

JSON data: texts, finite numbers, booleans, arrays and plain objects, for example the documents of a database. Each op is a function, so a standalone module can copy the domain. Put it last, so that `add`, `eq` and the other ops of `NumDomain`, `TextDomain` and `BoolDomain` come first. `kinds` gives `"null"` for a `null` item. `field` of a missing key or of a `null` field gives `#CALC!`. The values are of the type `JSON value`.

| Op | Call | Result | Lifts numbers | Laws | Identity |
|---|---|---|---|---|---|
| `kind` | `kind(JSON value)` | string |  |  |  |
| `kinds` | `kinds(JSON value)` | list |  |  |  |
| `fields` | `fields(JSON value)` | list |  |  |  |
| `field` | `field(JSON value, value)` | value |  |  |  |
| `leaves` | `leaves(JSON value, number)` | list |  |  |  |
