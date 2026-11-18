---
"@mark1russell7/vex": patch
---

The entry `@mark1russell7/vex/query` holds a query model of flat records (spec section 13). It imports only the core. `fieldCatalog` finds the fields of the records, with their types and their facets. `compileView` compiles a view of search words, facets and a formula to one program.

`matchView` gives the matches and the counts of the facets. `sortIds` sorts by a field, and a time field sorts by `epochMillis`. `viewToQuery` and `viewFromQuery` write a view into the query of a link and read it back. `sameFilter` compares two views.
