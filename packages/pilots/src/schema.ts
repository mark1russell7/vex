/**
 * The schema pilot (EXAMPLE.SCHEMA). The pilot gives the schema of a collection from sample documents. For each field
 * path of up to 20 sample documents, it gives the kinds of the values and the number of documents with the path.
 * `SCHEMA_PROGRAM` of `@mark1russell7/vex-domains` is one Vex program that gives these records, with the ops of
 * `JsonDomain` and the list ops. The tests of the pilot compare it with a reference in plain TypeScript.
 *
 * This module gives the program, its domains and `schemaOf` again, so the tests and the benches read them in one place.
 */
export { SCHEMA_DOMAINS, SCHEMA_PROGRAM, schemaOf, type JsonFieldSchema } from "@mark1russell7/vex-domains";
