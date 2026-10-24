# @mark1russell7/vex-testkit

[![npm](https://img.shields.io/npm/v/@mark1russell7/vex-testkit)](https://www.npmjs.com/package/@mark1russell7/vex-testkit) [![license](https://img.shields.io/npm/l/@mark1russell7/vex-testkit)](https://github.com/mark1russell7/vex/blob/main/LICENSE)

Property tests for [Vex](https://mark1russell7.github.io/vex/), with [fast-check](https://fast-check.dev/). The test kit checks the laws that a domain declares, and it generates random spaces and programs. Its reference interpreter for differential tests is the kernel of [coeval](https://github.com/mark1russell7/coeval).

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
| `arbNumberSpace`, `arbNumberExpr` | Programs over numbers that most often give a value, to compare the values of two tiers |
| `arbChangedDocument` | The document of a random program with one random change, to test the check of the documents |
| `referenceEvaluate`, `referenceRun` | The reference interpreter, for differential tests: the kernel of coeval with the machine of Vex (`kernelPlan`). The option `fns` gives the free functions. |
| `arbChain`, `runChain`, `modelChain` | The builder model test: random sequences of builder calls, the run of a sequence on the builder, and the expected expression of a sequence |

## License

MIT
