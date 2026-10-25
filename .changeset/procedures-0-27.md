---
"@mark1russell7/vex-mcp": minor
---

`@mark1russell7/vex-mcp` takes `@procedures/client` and `@procedures/mcp-server` `^0.27.2`, not `^0.14.1`. It also takes `@mark1russell7/service` `^0.5.8`, not `^0.5.5`, because the new client needs it. The five tools keep their names, their inputs and their hints. Each tool stays read-only and idempotent. The command `vex-mcp` still stops with the code 0 at the end of its input.

MINOR: before 1.0.0, a break of the public API raises MINOR. `vexModule` and `createHost` give the types of these packages, and those types changed from 0.14 to 0.27.

The changes for a caller of `createHost(faces)`:

- The face `http` has no listener of its own (`@procedures/mcp-server` 0.17.0). Its options `port`, `host` and `server` are removed.
- To serve the face `http`, mount `host.handleHttp` on a listener. Then declare the listener and the host on a service.
- The `token` of the face `http` is the token of the policy (0.27.0). The server of the host admits each HTTP request one time.
- The faces `stdio` and `sdk` do not change. The default face is the standard input and output, as before.
