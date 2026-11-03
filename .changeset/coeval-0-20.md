---
"@mark1russell7/vex": patch
---

Vex takes `@mark1russell7/coeval` 0.20.1 in place of 0.17. The behavior of Vex does not change. The breaking changes of coeval 0.18, 0.19 and 0.20 are in functions that Vex does not call: `conforms`, `encodeValue`, `factsOf`, the attributes of trees and the cells of a host.
