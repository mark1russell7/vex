# @mark1russell7/vex-domains

[![npm](https://img.shields.io/npm/v/@mark1russell7/vex-domains)](https://www.npmjs.com/package/@mark1russell7/vex-domains) [![license](https://img.shields.io/npm/l/@mark1russell7/vex-domains)](https://github.com/mark1russell7/vex/blob/main/LICENSE)

Domains for [Vex](https://mark1russell7.github.io/vex/), the typed spreadsheet formulas over TypeScript objects. A domain tells Vex which values belong to it, which ops they have, and which laws the ops obey.

## Install

```sh
npm install @mark1russell7/vex @mark1russell7/vex-domains
```

## Domains

| Domain | Values | Example ops |
|---|---|---|
| `Vec2Domain` | `Vec2`: a 2D vector | `x`, `y`, `add`, `max`, `multiply`, `floor`, `length`, `dot`, `rotate` |
| `XYDomain` | `{ x, y }`: a 2D vector as plain data, for a standalone module | `x`, `y`, `add`, `max`, `multiply`, `floor`, `dot`, `length` |
| `NDVectorDomain` | `NDVector`: a vector with named components | `add`, `subtract`, `min`, `max`, `scale`, `dot`, `get` |
| `NumDomain` | numbers | `add`, `multiply`, `min`, `max`, `sqrt`, `floor`, `gt`, `vec2`, `xy`, `date` |
| `BoolDomain` | booleans | `and`, `or`, `xor`, `not` |
| `TextDomain` | texts | `concat`, `length`, `upper`, `lower`, `trim`, `contains` |
| `JsonDomain` | JSON data: texts, numbers, booleans, arrays and plain objects. Put it last. | `kind`, `kinds`, `fields`, `field` |
| `ColorDomain` | `Color`: an RGB color | `mix`, `add`, `multiply`, `luminance`, `relativeLuminance`, `contrast` |
| `AngleDomain` | `Angle`: an angle | `add`, `normalize`, `sin`, `cos`, `degrees` |
| `FnDomain`, `MaybeDomain` | Two example domains: function wrappers and `Maybe` | `invoke`, `map`, `chain`, `valueOr` |

## Example

The far corner of each box: its position plus its size.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const root = vex(Vec2Domain).over(space.record({ A: { position: new Vec2(2, 2), size: new Vec2(5, 4) } }));
root.from("position")._.add("size").at("A"); // => { tag: "some", value: new Vec2(7, 6) }
```

## Two dimensions in one value

When a program calculates the same value for x and y, use one `Vec2`, not two numbers. The op `vec2` of `NumDomain` makes a vector, and the ops `x` and `y` give its components. The ops `add`, `subtract`, `multiply`, `divide`, `min` and `max` work on each component, and they lift a number to a vector. A list of vectors needs `reduce("max")`, because the list op `max` takes only numbers.

```ts doctest
import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";

const items = vex(NumDomain, Vec2Domain).over(space.array([{ w: 10, h: 20 }, { w: 30, h: 5 }]));
const cell = items.start(0).each((t) => t.from("w")._.vec2(t.from("h"))).reduce("max")._.max(1);
cell.at("0"); // => { tag: "some", value: new Vec2(30, 20) }
```

The page [Vectors](https://mark1russell7.github.io/vex/learn/vectors/) tells more. The [domains page](https://mark1russell7.github.io/vex/reference/domains/) lists each op with its laws.

## License

MIT
