---
"@mark1russell7/vex-compiler": patch
---

In a module of `emitModule` and `emitSheetModule`, a field of the schema can have a list kind (COMPILE.MODULE.LIST.INPUT), for example `{ list: "domain:Band" }`. The record holds a `vex.list`, and the program uses the field as a list. The run gives the values of the interpreter. Another value, an item of another kind and an error item of `#DEPTH!` throw a `VexContractError`. The type `Schema` takes such a kind, and `ListKind` moves to `facts.ts`. Before, such a program gave the reason "the kinds of the values of "count" do not decide its op".
