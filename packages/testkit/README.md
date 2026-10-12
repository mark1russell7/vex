# @mark1russell7/vex-testkit

[![npm](https://img.shields.io/npm/v/@mark1russell7/vex-testkit)](https://www.npmjs.com/package/@mark1russell7/vex-testkit) [![license](https://img.shields.io/npm/l/@mark1russell7/vex-testkit)](https://github.com/mark1russell7/vex/blob/main/LICENSE)

Property tests for [Vex](https://mark1russell7.github.io/vex/), with [fast-check](https://fast-check.dev/). The test kit checks the laws that a domain declares, generates random spaces and programs, and has a reference interpreter for differential tests.

## Install

```sh
npm install --save-dev @mark1russell7/vex-testkit fast-check
```

## Check the laws of a domain

An op can declare laws, for example `commutative` and `associative`. `checkLaws` tests each law with random values:

```ts doctest
import { checkLaws } from "@mark1russell7/vex-testkit";
import { NumDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";

const failed = checkLaws(NumDomain, { arb: fc.integer({ min: -1000, max: 1000 }), numRuns: 50 }).filter((r) => !r.ok);
failed; // => []
```

## What it has

| Export | What it does |
|---|---|
| `checkLaws(domain, { arb, eq, numRuns })` | Tests each declared law, and gives one result for each law |
| `assertLaws(domain, options)` | Throws an error that lists each failed law |
| `arbSpace`, `arbExpr`, `arbOrigin`, `arbTreeInput` | Arbitraries for random spaces and programs |
| `referenceEvaluate` | A short reference interpreter, for differential tests. The option `fns` gives the free functions. |
| `arbChain`, `runChain`, `modelChain` | The builder model test: random sequences of builder calls, the run of a sequence on the builder, and the expected expression of a sequence |

## License

MIT
