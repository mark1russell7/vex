---
"@mark1russell7/vex": minor
---

Vex takes `@mark1russell7/coeval` 0.21.0 in place of 0.20.1. The behavior of Vex does not change. Vex does not use `typeFromSchema`, and a reference to a name in a document of Vex has one step. Thus the breaking changes of coeval 0.21.0 do not reach Vex.

The declarations of Vex refer to the types of coeval, for example `Envelope`. A project that also takes coeval 0.20 gets two copies of the kernel. Thus the change counts as a breaking change.
