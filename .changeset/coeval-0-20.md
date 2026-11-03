---
"@mark1russell7/vex": minor
---

Vex takes `@mark1russell7/coeval` 0.20.1 in place of 0.17. The behavior of Vex does not change. Vex does not call the functions that the breaking changes of coeval 0.18, 0.19 and 0.20 change. These are `conforms`, `encodeValue`, `factsOf`, the attributes of trees and the cells of a host. The declarations of Vex refer to the types of coeval, such as `Envelope`. A project that also takes coeval 0.17 gets two copies of the kernel. Thus the change counts as a breaking change.
