# Instructions for Claude

## Writing style

Write all prose of this repository in the style of ASD-STE100 Simplified Technical English (STE). This prose is the README files, this file, the TSDoc comments, the docs and the text that the site shows. The linter [`ste-lint`](https://github.com/mark1russell7/ste-lint) examines it.

- After a change to prose, start `pnpm lint:ste` and correct each finding. CI fails when there is an error.
- Keep each instruction to 20 words or fewer, and each description to 25 words or fewer.
- Do not use the modal verbs (`should`, `may`, `might`, `would`), semicolons or Latin abbreviations (`e.g.`, `i.e.`, `etc.`).
- Use the active voice. Start each sentence of a doc comment with its subject: "This function returns the value", not "Returns the value".
- Put code, file names and commands in code font. The linter counts each code span as one word.
- Add a word to the glossary in `ste.config.json` only if it is a real technical term of the project.

## The plan

`docs/REVIEW.md` is the plan of record. Read it before a change to the architecture. Its §6 is the target design, and its §11 is the roadmap.

`docs/QUALITY-PLAN.md` is the plan for the tests. Read it before you add a test tool. Each new defect follows its §7.

## Packages

- Make a new package with `pnpm package add <name> --preset=ts`. Do not write `package.json` or `tsconfig.json` by hand.
- Each package has a `tsconfig.test.json`. `pnpm typecheck` checks the source and the tests.
- `@mark1russell7/vex` has one runtime dependency: `@mark1russell7/coeval`, the kernel of the family (decision D13 in `docs/REVIEW.md`). Other packages depend on it, and it depends on none of them.
- The kernel checks and analyzes the documents, and it is the reference tier. Do not copy its machinery into Vex. Put each generic part into coeval.
- The type `Optional` comes from `@mark1russell7/optional`, the Optional of the family. It is a dev dependency, and the build copies the type into the declarations.
- The published packages are `@mark1russell7/vex`, `@mark1russell7/vex-domains`, `@mark1russell7/vex-testkit`, `@mark1russell7/vex-compiler` and `@mark1russell7/vex-mcp`. The other packages are private.
- The first four packages have one version. `@mark1russell7/vex-mcp` has its own version.

## Tests

- Each normative statement of the spec has a requirement ID. Each requirement ID has a test that names it.
- Each defect from `docs/archive/2026-07/BUGS.md` (V-001 to V-042) has a row in `spec/regressions.md`, and each row with the status `test` has a test that names its ID.
- Start `pnpm check` before a commit. It does the type check, Oxlint, the conventions check, the coverage, the tests, the doc tests and `ste-lint`.
- A code block of the docs with the meta word `doctest` is a test. Write `// => value` for a value and `// : Type` for a type.
- A golden file in `packages/core/src/__golden__` changes only with a change of the semantics. To accept it, start `vitest run -u`.
- The coverage of each published package must stay at 98, 96, 98 and 98 or more. The root `vitest.config.ts` sets these gates.
- The compiler must give the result of the interpreter for each program. Property P17 tests this. Read `docs/COMPILER.md` before a change to the compiler.
- The mutation lane (`pnpm --filter @vex/mutation run mutation`) fails under 95 %. Write a test that finds each surviving mutant.
- Disable a mutant only if it is equivalent. Write `// Stryker disable next-line <Mutator>: <reason>` above the line.
