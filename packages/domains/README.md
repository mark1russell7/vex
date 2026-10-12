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
| `Vec2Domain` | `Vec2`: a 2D vector | `add`, `subtract`, `scale`, `length`, `distance`, `dot`, `rotate`, `allPositive` |
| `NDVectorDomain` | `NDVector`: a vector with named components | `add`, `subtract`, `scale`, `dot` |
| `NumDomain` | numbers | `add`, `multiply`, `min`, `max`, `sqrt`, `floor`, `gt` |
| `BoolDomain` | booleans | `and`, `or`, `xor`, `not` |
| `TextDomain` | texts | `concat`, `length`, `upper`, `lower`, `trim`, `contains` |
| `ColorDomain` | `Color`: an RGB color | `mix`, `add`, `multiply`, `luminance` |
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

The [domains page](https://mark1russell7.github.io/vex/reference/domains/) lists each op with its laws.

## License

MIT
