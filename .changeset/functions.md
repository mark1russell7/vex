---
"@mark1russell7/vex": minor
"@mark1russell7/vex-testkit": minor
"@mark1russell7/vex-compiler": minor
---

A binding of `let` can be a function: `fn(params, body)`. The node `call(name, ...args)` applies it (FN.BIND, FN.CALL). The body evaluates at the position of the call, with the names of the place of its binding. A function cannot call itself, so each call ends (FN.TOTAL). `deps` reads the body at each call. Tier 2 and a standalone module put the body at each call, in at most 10000 places. The JSON Schema of the IR has the two nodes. The reference interpreter and the random programs of the test kit have functions too.
