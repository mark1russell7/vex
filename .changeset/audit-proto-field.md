---
"@mark1russell7/vex": patch
---

A record keeps a field with the name `__proto__` (V-062). Before, an assignment of that key changed the prototype of the new record, and the record lost the field. This defect was in `parse`, in `serialize`, in the node `rec` and in the builder methods `rec` and `fork`. Thus a binding with that name was missing, and a literal record got another prototype. Each record gets its fields from `Object.fromEntries`.

The change is a fix, and the API does not change, so the change is a patch.
