/**
 * The schema pilot (EXAMPLE.SCHEMA). The app Graph shows the schema of a collection. For each field path of up to 20
 * sample documents, it shows the kinds of the values and the number of documents with the path. Its functions `inferSchema` and
 * `valueKind` do this in TypeScript. `SCHEMA_PROGRAM` of `@mark1russell7/vex-domains` is one Vex program that gives the
 * same records, with the ops of `JsonDomain` and the list ops. The tests of the pilot compare the two.
 *
 * This module gives the program, its domains and `schemaOf` again, so the tests and the benches read them in one place.
 */
export { SCHEMA_DOMAINS, SCHEMA_PROGRAM, schemaOf, type JsonFieldSchema } from "@mark1russell7/vex-domains";
