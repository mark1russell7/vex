<!-- ste-disable -->
> **Raw research report (2026-10-08).** Research: versions, testing and CI strategy, interactive documentation. A research agent of the 2026-10-08 review wrote this report. It is kept verbatim as evidence. The synthesis and the decisions are in [../REVIEW.md](../REVIEW.md). This file is not STE text.

# Vex: dependency refresh, testing and CI strategy, and an interactive docs site

**Research report, verified 2026-10-08**

**How this was checked.**
- Versions and dates come straight from npm registry packuments and the GitHub Releases API, queried on 2026-10-08.
- Other facts come from primary sources (official blogs, changelogs, release notes, issues, repo files), linked inline.
- The research ran as six parallel passes.
- Some claims were tested in scratch directories and are marked **[verified locally]**:
  - TypeScript 6 and 7 installed side by side on pnpm 12.10.1, including catalogs.
  - ESLint 10 with typescript-eslint running on the TS 6 alias.
  - Oxlint type-aware rules.
  - Vitest 5 typecheck running under TS 7.
- No repo was modified.
- Each Part ends with an **Uncertain** list. Anything marked *(proposal)* is my design, not a sourced fact.

---

## 0. Executive summary

1. **TypeScript 7.0 (the Go port) is GA and is `typescript@latest` (7.0.2, 2026-07-08). Version 7.0 ships no JS compiler API.**
   - `require("typescript")` returns only `{version, versionMajorMinor}` [verified locally].
   - Every tool that drives the TS API must stay on TS 6.0.3. That covers typescript-eslint, TypeDoc and starlight-typedoc, twoslash and Shiki-twoslash, `@typescript/vfs` (the in-browser language service), TSTyche, Stryker's TS checker, and Astro/MDX/Volar tooling.
   - The official side-by-side recipe works on pnpm 12 with catalogs [verified locally]: `typescript` → `npm:@typescript/typescript6` and `@typescript/native` → `npm:typescript@^7`.
   - TS 7.1 (new API, wasm build) is planned for 2026-11-24, but its 2026-10-06 beta has not appeared.
2. **Node.**
   - Develop on 24 LTS now, and on 26 once it becomes LTS on **2026-10-28**. Run CI on 22, 24 and 26.
   - **This machine runs Node 25.2.1.** That line reached end of life on 2026-06-01 and is outside the supported engines of Vitest 5, tsdown 0.23, size-limit 14 and Changesets 3.
   - Starting with v27, Node ships one major release a year, every release becomes LTS, and there is a new Alpha channel.
3. **pnpm 12** (August 2026) is a Rust rewrite with the same lockfile (v9).
   - Settings live in `pnpm-workspace.yaml`, and unknown keys are hard errors.
   - Since pnpm 11, these supply-chain defaults are on: `minimumReleaseAge` of 1 day, `strictDepBuilds`, `blockExoticSubdeps` and `allowBuilds`.
4. **Vitest 5 and Vite 8.** Coming from Vitest 3.2.4 means taking both the v4 and the v5 breaking changes (Part A.5).
5. **Lint and format.**
   - Use Oxlint 1.87 with tsgolint as the CI gate. Its type-aware mode is stable, runs on TS 7, and covers all `no-unsafe-*` rules. Those rules hit Vex's worst defect class head-on: the `any`-typed fluent surface (V-012).
   - Format with Prettier 3.9.
   - Keep ESLint 10 only for plugins that exist only in ESLint.
6. **Build and release.**
   - Build with tsdown 0.23 (Rolldown 1.x), ESM-only, with `dts.generator: 'oxc'`. Your cue base tsconfig already sets `isolatedDeclarations`.
   - Release with Changesets 3, changesets/action v2 and npm trusted publishing (OIDC).
   - tsup is unmaintained.
7. **Two silent traps.**
   - Stryker 10 with Vitest 5 reports bogus, near-zero mutation scores ([#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)).
   - CodSpeed's Vitest plugin does not support Vitest 5.
   - Run both in a lane pinned to Vitest 4.1.11, or use CodSpeed's tinybench plugin, until they are fixed.
8. **Testing.**
   - A conformance suite in the style of test262 and CommonMark: one typed case file per spec example or MUST clause, plus a ledger of known failures.
   - Golden snapshots of IR and evaluation traces.
   - fast-check for four things: random programs never throw, ops honour their declared metadata laws, the builder matches a model, and the evaluator agrees with a small reference interpreter.
   - Type tests on TS 7, a matrix of consumer TS versions, and instantiation budgets.
   - Mutation testing on the kernel.
9. **CI.**
   - Pin every action by SHA.
   - Make one aggregate "CI OK" check the only required check.
   - Use Renovate for updates; Dependabot does not officially support pnpm 11 or 12.
   - Use npm trusted publishing. New trusted-publisher configs only allow staged publishing by default since 2026-09-03, so opt into direct publish, because Changesets cannot stage yet.
10. **Docs site.**
    - Astro 7 with Starlight 0.42 and interactive islands, the same stack as effect.website.
    - The docs package pins TS 6.0.3.
    - Code editing uses CodeMirror 6 with a TS 6 language service in a Web Worker.
    - User code is transpiled with ts-blank-space and runs in a sandboxed module Worker.
    - GitHub Pages cannot set COOP/COEP headers, so self-hosted WebContainers and oxc's wasm build are out.
11. **Build `chain.explain(start)` first (Roadmap P3.4).** One JSON trace format feeds the golden tests, every docs visualization, the conformance matrix and the "why none?" experience.
12. **Match your existing conventions.**
    - Your portfolio monorepo (`mark1russell7.github.io`) already runs pnpm 12.10.1, TS ^7.0.2, Vite 8, Vitest 5 and Node 26 in CI. Its workflows use checkout v7, setup-node v7, action-setup v6 and Pages artifact/deploy v5, and its prose is linted by `ste-lint`.
    - Your workspace CLAUDE.md requires scaffolding with `lib new` and `cue-config`. cue-config has no pnpm-workspace, catalog, tsdown or Astro features yet (no matches in `cue/src`), so add those features instead of writing configs by hand.
    - Vex's `.gitmodules` uses `git@github.com:` SSH URLs. Funk is imported by 15 files and is public, so CI needs HTTPS submodule URLs plus `submodules: recursive`, or Funk vendored (Roadmap 4.3).

---

# Part A: Current versions and migration notes

## A.1 Version table

All versions were queried on 2026-10-08. "Released" is the publish date of the latest stable, with the first release of the current major in parentheses.

**Core toolchain**

| Package | Latest stable | Released | Key breaking changes / notes | Link |
|---|---|---|---|---|
| `typescript` | **7.0.2** (`next` = 7.1.0-dev.20261008.1) | 2026-07-08 | Native Go port ("10x faster"). **No JS API in 7.0.** All TS 6.0 deprecations are hard errors. `stableTypeOrdering` is always on. New flags: `--checkers`, `--builders`, `--singleThreaded`. Editor support is via LSP. Vue, MDX, Astro and Svelte tooling must stay on 6.0. | [TS 7.0 post](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |
| `typescript` 6.x | 6.0.3 | 2026-04-16 (GA 6.0.2 on 2026-03-23) | The last JS-based TS; new defaults and deprecations in §A.2. | [TS 6.0 post](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) |
| `@typescript/typescript6` | 6.0.2 (resolves to TS 6.0.3) | 2026-07-06 | The official TS 6 API shim; its bin is `tsc6`. | [npm](https://www.npmjs.com/package/@typescript/typescript6) |
| `@typescript/native-preview` | 7.0.0-dev.20260707.2 | 2026-07-07 | **Frozen.** Nightlies now ship as `typescript@next`; rename `tsgo` scripts to `tsc`. | TS 7.0 post |
| Node.js | **24.21.0 LTS "Krypton"**; 26.11.1 Current; 22.23.3 Maintenance | 2026-09-07 / 2026-10-07 / 2026-09-23 | 24 enters maintenance 2026-10-20. **26 becomes LTS 2026-10-28.** 22 reaches EOL 2027-04-30. 20 reached EOL 2026-04-30 and 25 on 2026-06-01. | [schedule.json](https://github.com/nodejs/Release/blob/main/schedule.json), [new release model](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule) |
| `pnpm` | **12.10.1** | 2026-10-06 (12.0.0 on 2026-08-26) | Rust rewrite with the same commands, settings and lockfile v9. Unknown workspace keys are errors; `engineStrict` follows dependencies. v11 changes: Node 22+, non-auth settings moved out of `.npmrc`, `minimumReleaseAge` 1 day, `allowBuilds`. | [pnpm 12](https://pnpm.io/blog/releases/12.0), [pnpm 11](https://pnpm.io/blog/releases/11.0) |
| `vite` | 8.3.4 | 2026-10-08 (8.0 on 2026-03-12) | Rolldown and Oxc; needs Node 20.19+ or 22.12+. | [Vite 8](https://vite.dev/blog/announcing-vite8) |
| `vitest` | **5.0.3** (V4 = 4.1.11, V3 = 3.2.7) | 2026-09-30 (5.0.0 on 2026-09-03) | Needs Node ≥22.12 and Vite ≥6.4. `clearMocks` defaults to true. Unawaited `resolves`/`rejects`/`toMatchFileSnapshot` now fail. `vi.mock` must be top-level. No parent-directory config lookup. `testNamePattern` matches the full name joined with `" > "`. `bench` was rewritten. Output goes to `.vitest/`. | [Vitest 5](https://vitest.dev/blog/vitest-5), [migration](https://vitest.dev/guide/migration) |
| `@vitest/coverage-v8` | 5.0.3 | 2026-09-30 | AST-based remapping only, and `coverage.all` removed so `coverage.include` must be set (both v4). Glob thresholds no longer inherit `perFile` (v5). The peer pins vitest exactly. | [Vitest 4](https://vitest.dev/blog/vitest-4) |
| `@vitest/browser-playwright` | 5.0.3 | 2026-09-30 | Browser mode stable since v4; providers ship as separate packages. | [Vitest 4](https://vitest.dev/blog/vitest-4) |
| `eslint` | 10.12.0 | 2026-10-02 (10.0 on 2026-02-06) | eslintrc fully removed. Config is looked up from each linted file's directory. Node ^20.19, ^22.13 or ≥24. v9 has been EOL since 2026-08-06. | [ESLint 10](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/), [version support](https://eslint.org/version-support/) |
| `typescript-eslint` | 8.71.1 | 2026-10-05 | TS peer `>=4.8.4 <6.1.0`, so **no TS 7**. [#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518) was closed "not planned" until a TS 7 API exists. `tseslint.config()` is deprecated in favour of `defineConfig()`. | [dependency versions](https://typescript-eslint.io/users/dependency-versions/) |
| `prettier` | 3.9.9 | 2026-09-23 (3.9.0 on 2026-06-27) | Markdown now uses micromark v4. The 4.0 alpha has stalled since 2025-11. | [3.9](https://prettier.io/blog/2026/06/27/3.9.0) |
| `@biomejs/biome` | 2.5.15 | 2026-09-30 | 500+ rules and its own type inference, with no TS dependency. It has **no `no-unsafe-*` family**. `recommended` becomes `linter.rules.preset`. | [Biome 2.5](https://biomejs.dev/blog/biome-v2-5/), [domains](https://biomejs.dev/linter/domains/) |
| `oxlint` + `oxlint-tsgolint` | 1.87.0 + 7.0.2003 | 2026-10-05 / 2026-09-24 | **Type-aware linting stable since 2026-07-22; it requires TS 7.** Covers 59 of 61 typescript-eslint typed rules. JS plugins are still alpha. | [post](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable), [tsgolint](https://github.com/oxc-project/tsgolint) |
| `oxfmt` | 0.72.0 | 2026-10-05 | Beta. Claims 100% of Prettier's JS/TS conformance tests. No Prettier plugins. | [beta post](https://oxc.rs/blog/2026-02-24-oxfmt-beta) |
| `vite-plus` | 1.1.0 | 2026-10-07 (1.0 on 2026-09-28) | MIT all-in-one: Vite, Vitest, Oxlint, Oxfmt, Rolldown and tsdown. Watch it; don't adopt yet. | [guide](https://viteplus.dev/guide) |
| `@types/node` | 26.6.4 (use ^24 for tests) | 2026-10-01 | — | npm |

**Build, publish and quality**

| Package | Latest stable | Released | Key breaking changes / notes | Link |
|---|---|---|---|---|
| `tsdown` | 0.23.0 | 2026-09-03 | Still 0.x. `bundle:false` becomes `unbundle`; `dts.oxc`/`dts.tsgo` become `dts.generator`; the attw default profile is now `esm-only`. Node ^22.18, ^24.11 or ≥26. Built-in publint, attw and `exports` generation. | [v0.23.0](https://github.com/rolldown/tsdown/releases/tag/v0.23.0) |
| `rolldown` / `rolldown-plugin-dts` | 1.2.13 / 0.28.6 | 2026-10-07 / 2026-09-16 | Rolldown 1.0 GA 2026-05-07. Declaration generators: `oxc` (needs `isolatedDeclarations`), `tsc` (TS 5–6), `tsgo` (experimental). | [plugin-dts](https://github.com/sxzz/rolldown-plugin-dts) |
| `tsup` | 8.5.1 | 2025-11-12 | README: "not actively maintained… consider using tsdown". | [repo](https://github.com/egoist/tsup) |
| `unbuild` | 3.6.1 | 2025-08-15 | README points to **obuild** (Rolldown-based, beta). | [repo](https://github.com/unjs/unbuild) |
| `@changesets/cli` | 3.0.3 | 2026-09-14 (3.0.0 on 2026-08-11) | `tag` becomes `git-tag`. `version` exits 1 when there are no changesets. Private packages are not versioned by default. A peer bump now gives dependents a patch. `format:` replaces `prettier`. ESM-only. Node ^22.11, ^24 or ≥26; pnpm ≥10. | [CHANGELOG](https://github.com/changesets/changesets/blob/main/packages/cli/CHANGELOG.md) |
| `changesets/action` | v2.1.2 | 2026-09-07 | Needs CLI v3. Inputs renamed; split into sub-actions; commits signed through the API. NPM_TOKEN `.npmrc` handling removed. | [v2.0.0](https://github.com/changesets/action/releases/tag/v2.0.0) |
| `publint` | 0.3.25 | 2026-10-01 | Suggests `engines.node` and `sideEffects:false`; pnpm 12 tarball fix. | [CHANGELOG](https://github.com/publint/publint/blob/master/packages/publint/CHANGELOG.md) |
| `@arethetypeswrong/cli` | 0.18.5 | 2026-07-09 | Bundles its own TS (5.6.1-rc), so it is unaffected by TS 7. `--pack` only works with npm. | [README](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/packages/cli/README.md) |
| `fast-check` | 4.10.2 | 2026-09-19 (4.0 on 2025-03-10) | v4: TS ≥5; string arbitraries replaced by `fc.string({unit})`; `noBias`/`noShrink` become functions; `errorInstance` replaces `error`. 4.8 adds `chainUntil`; 4.10 adds a plugin API. | [migration](https://fast-check.dev/docs/migration-guide/from-3.x-to-4.x/), [4.10](https://github.com/dubzzz/fast-check/releases/tag/v4.10.0) |
| `@fast-check/vitest` | 0.5.0 | 2026-09-11 | Peer `vitest ^4.1 \|\| ^5`; ESM-only. | [release](https://github.com/dubzzz/fast-check/releases/tag/vitest%2Fv0.5.0) |
| `@stryker-mutator/*` | 10.0.0 | 2026-08-14 | Node ≥22. Experimental TS 7 checker that still needs TS 6 installed as `typescript`. **Mis-scores under Vitest 5.** | [v10](https://github.com/stryker-mutator/stryker-js/releases/tag/v10.0.0), [#6210](https://github.com/stryker-mutator/stryker-js/issues/6210) |
| `expect-type` | 1.4.0 | 2026-06-25 | `toMatchTypeOf` deprecated in favour of `toExtend`/`toMatchObjectType`; compatible with tsgo. | [releases](https://github.com/mmkal/expect-type/releases) |
| `tstyche` | 7.2.5 | 2026-09-10 (7.0 on 2026-04-02) | Config file is `./tstyche.json`; `toRaiseError` deprecated. **Cannot target TS 7**: its version store is `>=5.4 <7`. | [TSTyche 7](https://tstyche.org/releases/tstyche-7), [#710](https://github.com/tstyche/tstyche/pull/710) |
| `tsd` | 0.33.0 | 2025-08-05 | Stale; bundles TS 5.9. | [release](https://github.com/tsdjs/tsd/releases/tag/v0.33.0) |
| `@ark/attest` | 0.57.0 | 2026-10-07 | Alpha. `tsVersions` removed. Its TS 7 backend needs 7.1. | [#1680](https://github.com/arktypeio/arktype/pull/1680) |
| `size-limit` (+ `@size-limit/preset-small-lib`) | 14.2.0 | 2026-10-07 (14.0 on 2026-09-15) | The preset now uses Rolldown. Node ^22.19, ^24.5 or ≥26. `size-limit-action` is stale (node20), so call the CLI directly. | [CHANGELOG](https://github.com/ai/size-limit/blob/main/CHANGELOG.md) |
| `knip` | 6.40.0 | 2026-10-06 (6.0 on 2026-03-20) | Built on oxc, with no TS dependency. `classMembers` removed. Adds `catalog`/`catalogReferences` issue types. | [knip v6](https://knip.dev/blog/knip-v6), [issue types](https://knip.dev/reference/issue-types) |
| `syncpack` | 15.3.3 | 2026-08-09 | v14 was a Rust rewrite with a new API; v15 adds full catalog support. | [15.0.0](https://github.com/JamieMason/syncpack/releases/tag/15.0.0) |
| `@manypkg/cli` | 0.25.1 | 2025-08-28 | Low activity; no catalog features. | [CHANGELOG](https://github.com/Thinkmill/manypkg/blob/main/packages/cli/CHANGELOG.md) |
| `@microsoft/api-extractor` | 7.59.4 | 2026-10-06 | Bundles TS 5.9.3, so it cannot read 6.0-only syntax or libs. | [#6033](https://github.com/microsoft/rushstack/issues/6033) |
| `typedoc` | 0.28.20 | 2026-07-05 | Supports TS 5.0–6.0. TS 7 support is aimed "closer to the 7.1 RC". | [#3098](https://github.com/TypeStrong/typedoc/issues/3098) |
| `typedoc-plugin-markdown` | 4.13.1 | 2026-09-18 | Peer `typedoc 0.28.x`. | [CHANGELOG](https://github.com/typedoc2md/typedoc-plugin-markdown/blob/main/packages/typedoc-plugin-markdown/CHANGELOG.md) |
| `turbo` / `nx` | 2.11.7 / 23.3.0 | 2026-10-02 / 2026-10-07 | Not needed at 2–5 packages (§B.11). | npm |

## A.2 TypeScript 6 and 7: what changed and how Vex should run both

### TS 6.0 (GA 2026-03-23)

It is a "bridge" release ([post](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)).

**New defaults:**
- `strict: true` and `module: esnext`.
- `target` floats to the latest ES version (es2025).
- `types: []`, so `["node"]` must be listed explicitly.
- `rootDir` is the directory containing the tsconfig.
- `noUncheckedSideEffectImports: true`.
- `dom` now includes `dom.iterable`.

**New features:**
- `--stableTypeOrdering`.
- The es2025 target and lib.
- Temporal types.
- `#/` subpath imports.

**Deprecations.** In 6.0 these can be silenced with `"ignoreDeprecations": "6.0"`. In 7.0 they are hard errors ([TS 7 post](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
- `target: es5` and `downlevelIteration`.
- `moduleResolution: node`/`node10`. `classic` and `outFile` are removed.
- `module: amd`, `umd`, `systemjs` and `none`.
- `baseUrl`, which is no longer a lookup root.
- Setting `esModuleInterop`, `allowSyntheticDefaultImports` or `alwaysStrict` to `false`.
- `module Foo {}`, in favour of `namespace`.
- Import `asserts {}`, in favour of `with {}`.

### TS 7.0 (GA 2026-07-08)

- Full builds are 8–12× faster. `npm i -D typescript` now installs a native `tsc`.
- Code that compiles cleanly on 6.0 with `stableTypeOrdering` on and no `ignoreDeprecations` is promised to compile the same way on 7.0 ([post](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
- **There is no programmatic API.**
  - `require("typescript")` returns only the version [verified locally].
  - The undocumented `typescript/unstable/*` subpaths exist; treat them as private.
- **TS 7.1 plan** ([#63703](https://github.com/microsoft/TypeScript/issues/63703)): beta 2026-10-06, RC 2026-11-10, stable 2026-11-24. It covers a stable API including the language service, an es2026 target, a wasm build, and the Playground running on wasm. As of today there is no 7.1 beta on npm.

### TS 6 vs TS 7 compatibility matrix (merged from npm peer ranges, issues and local tests)

| Tool | Needs the TS JS API? | Works when `typescript` is 7.0? |
|---|---|---|
| `tsc` typecheck and emit of Vex | — | Yes |
| Vitest typecheck (`expectTypeOf`) | No (it runs the `tsc` CLI) | **Yes** [verified locally] |
| expect-type 1.4 | Types only | Yes (tsgo fix since 1.2.2) |
| oxlint-tsgolint 7.x | Built on TS 7 | **Yes; it requires TS 7** |
| tsdown 0.23 / rolldown-plugin-dts | Depends on the generator | Yes with `oxc`; `tsc` needs TS 5–6; `tsgo` is experimental |
| publint, attw, knip 6, size-limit 14, syncpack 15 | No (attw bundles its own TS) | Yes |
| fast-check, Stryker core and vitest-runner | No | Yes, but see the Vitest 5 trap |
| typescript-eslint 8.71 | **Yes** | **No** |
| TypeDoc 0.28, typedoc-plugin-markdown, starlight-typedoc | **Yes** | **No** (TS 7 targeted around the 7.1 RC) |
| twoslash 0.3.9 / @shikijs/twoslash 4.5 / twoslash-cdn | **Yes** | **No** ([twoslash#93](https://github.com/twoslashes/twoslash/issues/93): no work started) |
| expressive-code-twoslash 0.6.1 | **Yes** | No. Its peer is `typescript ^5.5` only, and it peers EC ^0.41, so it is out of range for Starlight 0.42. |
| @typescript/vfs 1.6.5, @typescript/sandbox, @typescript/ata, ts-blank-space 0.9 | **Yes** | No. Also, vfs cannot find `lib.*.d.ts` through the `@typescript/typescript6` alias ([#3645](https://github.com/microsoft/TypeScript-Website/issues/3645)). |
| TSTyche 7.2 | **Yes** | No (falls back to TS 6) |
| @ark/attest 0.57 | **Yes** | Needs 7.1 |
| Stryker typescript-checker 10 | **Yes** | Experimental TS 7 mode, which still needs TS 6 as `typescript` ([#6099](https://github.com/stryker-mutator/stryker-js/pull/6099)) |
| api-extractor 7.59 | Bundles TS 5.9.3 | Independent of your TS, but blind to TS 6-only syntax |
| @astrojs/check, Astro/MDX/Svelte/Volar editor tooling | **Yes** | **No**, according to the TS team |
| fumadocs-twoslash 4 / fumadocs-typescript 5.4 | Bundles `typescript ~7.0.2` (`unstable/sync`) | Yes. The only TS 7-native docs type tooling. |

### Recommended setup

**Library packages and root.** This is the official recipe, verified on pnpm 12.10.1 with catalogs. `.bin/tsc` runs 7.0.2, `.bin/tsc6` runs 6.0.3, and `require('typescript')` returns the 6.0.3 API.

```yaml
# pnpm-workspace.yaml (excerpt)
catalog:
  typescript: npm:@typescript/typescript6@^6.0.2   # TS 6 API for typescript-eslint/TypeDoc/TSTyche/Stryker checker
  "@typescript/native": npm:typescript@~7.0.2      # provides `tsc` = TS 7
catalogs:
  ts6:
    typescript: 6.0.3                              # real TS 6 for the docs package (twoslash, vfs, TypeDoc, astro check)
```

- The docs package uses `"typescript": "catalog:ts6"`, a real 6.0.3, because the vfs alias bug rules out the shim there.
- ArkType does the same thing with a `ts6` catalog plus a [`pnpmfile.ts`](https://github.com/arktypeio/arktype/blob/main/pnpmfile.ts) `readPackage` hook that hands TS 6 to typescript-eslint, tsup, rollup-plugin-dts and knip ([pnpm-workspace.yaml](https://github.com/arktypeio/arktype/blob/main/pnpm-workspace.yaml)).
- Collapse back to a single `typescript@^7.1` once 7.1 GA ships its API and TypeDoc, typescript-eslint and twoslash adopt it. Expect that in Q1 2027 at the earliest.

### Vex tsconfig notes

Current config: `target esnext`, `module esnext`, `moduleResolution bundler`, `esModuleInterop`, `rootDir ./`, `include ./`.

- Everything in it is legal on TS 6 and 7. Drop `esModuleInterop`, which is now forced on. Use a per-package `rootDir: "src"`.
- Vex uses no Node APIs, so the library can use `types: []` and an ES-only lib. Tests add `["node"]` only if they need it.
- **Add `verbatimModuleSyntax: true`.** It guarantees that untyped imports are never elided, which guards the known "adapter registration import silently elided" bug (V-003). TS 6/7 also default `noUncheckedSideEffectImports` to true.
- Your cue base configs (`cue/ts/config/base.json`, `esm.json`, `lib.json`) are already ready for TS 6 and 7. They set `isolatedDeclarations`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and a `${configDir}/src` rootDir. Revisit four items:
  - `esModuleInterop` and `allowSyntheticDefaultImports` are redundant now.
  - `importHelpers: true` needs `tslib` if tsc emits helpers. That does not matter under tsdown.
  - `dom.iterable` in `vite.json` is now part of `dom`.
  - Packages that use Node globals must list `types: ["node"]` explicitly, because the default is now `[]`.
- **`isolatedDeclarations` forces explicit types on exported fluent APIs.** That is extra work for the typed chain surface (Roadmap P3.2). It is also exactly JSR's "no slow types" rule, and it gives the fastest declaration generation through tsdown's `oxc` generator.
- Vex's 5 `enum`s and its parameter properties are fine for tsc, tsdown and Vitest. They do block `erasableSyntaxOnly` and running `.ts` natively in Node, and Node 26 removed `--experimental-transform-types` ([Node TS docs](https://nodejs.org/api/typescript.html)). Convert them to `as const` objects only if you want that.

## A.3 Node.js

| Line | Status on 2026-10-08 | Next | EOL |
|---|---|---|---|
| 26.x (26.11.1) | Current since 2026-05-05 | **LTS on 2026-10-28** | 2029-04-30 |
| 24.x "Krypton" (24.21.0, npm 11.19.0) | **Active LTS** | Maintenance on 2026-10-20 | 2028-04-30 |
| 22.x "Jod" (22.23.3, npm 10.9.9) | Maintenance | — | 2027-04-30 |
| 20.x / 25.x | EOL (2026-04-30 / 2026-06-01) | — | — |

Sources: [schedule.json](https://github.com/nodejs/Release/blob/main/schedule.json), [dist index](https://nodejs.org/dist/index.json).

- **New release model** ([announcement](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule)):
  - From 27.x there is one major a year, released in April, and every release becomes LTS.
  - A new Alpha channel runs October to March. The v27 alpha is scheduled for 2026-10-28.
  - Library authors are asked to add alphas to CI early.
  - The schedule "is not final and may be amended."
- **Type stripping** ([docs](https://nodejs.org/api/typescript.html)):
  - On by default since 23.6 and 22.18; stable since 25.2 and 24.12.
  - `--experimental-transform-types` was removed in 26.0.
  - Enums, runtime namespaces and parameter properties throw.
- **`require(esm)`** ([docs](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)):
  - Unflagged in 20.19 and 22.12; no longer experimental since 25.4.
  - This makes an **ESM-only** Vex safe for CommonJS consumers on every supported Node line, as long as there is no top-level await.
- **Corepack is not bundled with Node ≥25** ([docs](https://nodejs.org/download/release/latest-v25.x/docs/api/corepack.html)). Use the pnpm setup actions in CI.

## A.4 pnpm 10 → 12

**v10** ([release](https://github.com/pnpm/pnpm/releases/tag/v10.0.0)):
- Dependency lifecycle scripts are off by default.
- Nothing is public-hoisted.

**v11** (2026-04-28, [post](https://pnpm.io/blog/releases/11.0)):
- Node 22+, pure ESM.
- `.npmrc` holds only auth, registry and network settings. Everything else lives in `pnpm-workspace.yaml`, and `npm_config_*` env vars are ignored in favour of `pnpm_config_*`.
- New defaults: `minimumReleaseAge: 1440`, `blockExoticSubdeps`, `strictDepBuilds`.
- `allowBuilds` replaces `onlyBuiltDependencies` and its siblings.
- `pnpm publish` is native, with OIDC support.

**v12** (2026-08-26, [post](https://pnpm.io/blog/releases/12.0), [what's different](https://pnpm.io/blog/whats-different-in-pnpm-12)):
- A Rust rewrite with the same lockfile (`lockfileVersion: '9.0'`) [verified locally].
- **Unknown workspace keys are hard errors** (`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`). It caught a typo and suggested the right key [verified locally].
- `engineStrict` follows regular dependency edges.
- `--frozen-lockfile false` was removed.

**Catalogs** ([docs](https://pnpm.io/catalogs)):
- `catalog:` and `catalog:<name>` work in every dependency field.
- They are rewritten to real ranges on pack and publish, including the `npm:` aliases [verified locally].
- `catalogMode: strict` only governs `pnpm add`.
- `cleanupUnusedCatalogs` was renamed **`catalogPrune`** in 11.22.
- **Gotcha** [verified locally]: `catalogPrune` deletes an entry that nothing consumes yet. Add a catalog entry and its consumer in the same change.

**Supply-chain settings** ([dependency resolution](https://pnpm.io/settings/dependency-resolution), [build](https://pnpm.io/settings/build)):
- `minimumReleaseAge` and `minimumReleaseAgeExclude`.
- `trustPolicy: no-downgrade` fails when a package's provenance or trust level drops.
- `blockExoticSubdeps`.
- `allowBuilds`.

**Recommended `pnpm-workspace.yaml`.** It was accepted by pnpm 12.10.1. Vitest 5 and Vite 8 needed no build approvals.

```yaml
packages: [packages/*, apps/*, tools/*, tests/*]
catalog:
  typescript: npm:@typescript/typescript6@^6.0.2
  "@typescript/native": npm:typescript@~7.0.2
  vitest: ^5.0.3
  "@vitest/coverage-v8": ^5.0.3         # peer pins vitest exactly; bump together
  "@fast-check/vitest": ^0.5.0
  fast-check: ^4.10.2
  tsdown: ~0.23.0                        # 0.x minors break config
  oxlint: ^1.87.0
  oxlint-tsgolint: ^7.0.2003
  prettier: ^3.9.9
  "@types/node": ^24.0.0
catalogs:
  ts6: { typescript: 6.0.3 }
  vitest4: { vitest: 4.1.11, "@vitest/coverage-v8": 4.1.11 }   # Stryker/CodSpeed lane until they support Vitest 5
catalogMode: strict
catalogPrune: true
minimumReleaseAge: 1440
trustPolicy: no-downgrade
blockExoticSubdeps: true
strictDepBuilds: true
allowBuilds: {}
saveWorkspaceProtocol: rolling
```

Root `package.json`: `"private": true, "type": "module", "packageManager": "pnpm@12.10.1"`, plus a `.node-version` file containing `24`.
- **Do not** add `devEngines.runtime` with `onFail: download`. pnpm then runs scripts on the pinned Node, which silently overrides the CI matrix Node ([docs](https://pnpm.io/package_json#devenginesruntime)).
- Prefer `packageManager` over `devEngines.packageManager`. The latter writes a two-document lockfile that breaks Dependabot ([#15904](https://github.com/dependabot/dependabot-core/issues/15904)).

## A.5 Vite 8 and Vitest 3.2 → 5 migration checklist for Vex

**Vitest 4** ([post](https://vitest.dev/blog/vitest-4), [migration](https://v4.vitest.dev/guide/migration)):
- `workspace` becomes `projects`.
- `coverage.all` and `coverage.extensions` were removed, so set `coverage.include`.
- V8 coverage uses AST-based remapping only.
- Pools: Tinypool is gone and `maxThreads`/`maxForks` become `maxWorkers`.
- The `basic` reporter was removed.
- `deps.inline` moves to `server.deps.*`.

**Vitest 4.1** ([post](https://vitest.dev/blog/vitest-4-1)): adds test tags, `coverage.changed`, `aroundEach` and `--detect-async-leaks`.

**Vitest 5** ([post](https://vitest.dev/blog/vitest-5), [migration](https://vitest.dev/guide/migration)):
- Node ≥22.12.
- `clearMocks` defaults to true.
- Unawaited `resolves`, `rejects` and `toMatchFileSnapshot` fail the test.
- `vi.mock` must be top-level.
- Config is not looked up from parent directories.
- `test.sequential` is removed in favour of `concurrent: false`.
- Custom matchers must augment `Matchers<R, T>`.
- Add `.vitest/` to `.gitignore`.

**Vex specifics:**
- Change `npm test` to `vitest run`. It is currently watch mode.
- Root config, verified working across packages:
  ```ts
  export default defineConfig({ test: {
    projects: ["packages/*", "tools/doctest"],
    coverage: { provider: "v8", include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.test-d.ts"],
      thresholds: { lines: 90, branches: 85,
        "packages/vex/src/eval/**": { lines: 100, branches: 95, perFile: true } } } } });
  ```
- **Benchmarks in Vitest 5** ([guide](https://vitest.dev/guide/benchmarking)). `bench` is a test-context fixture inside `*.bench.ts` files: `test("x", async ({ bench }) => …)`. Run them with `vitest bench`.
  - `bench.compare()` and `toBeFasterThan(…, { delta })` give relative assertions that survive noisy CI.
  - `writeResult` and `bench.from()` give committed baselines.
  - The guide no longer labels it experimental.

## A.6 Lint and format: recommendation

**Gate CI on Oxlint with tsgolint.**
- It is type-aware and also reports `tsc` diagnostics through `typeCheck`.
- It is the only mature typed linter that runs on TS 7 today.
- It ported 59 of 61 typescript-eslint typed rules, including all of `no-unsafe-*`, `switch-exhaustiveness-check`, `strict-boolean-expressions` and `no-unnecessary-condition` ([README](https://github.com/oxc-project/tsgolint)).
- It reported the same `no-unsafe-*` errors as typescript-eslint on a Vex-style `any` chain [verified locally].

Enable it in `.oxlintrc.json` (or `oxlint.config.ts`) with `"options": { "typeAware": true, "typeCheck": true }` ([docs](https://oxc.rs/docs/guide/usage/linter/type-aware)). Verify the exact keys against the 1.87 docs.

**Keep ESLint 10 with typescript-eslint, on the TS 6 alias, only for ESLint-only plugins.** Examples are `@eslint/markdown` for doc code blocks, `eslint-plugin-expect-type`, and `no-restricted-syntax` for banning `.tag`/`.right` (Roadmap 2.5). The config below was verified locally:

```js
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
export default defineConfig(
  globalIgnores(["**/dist/**", "**/coverage/**", "**/.vitest/**", "external/**"]),
  { files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
);
```

**Format with Prettier 3.9.x.** It is stable and also formats the site's MD, MDX and YAML.
- oxfmt 0.72 is still beta: pin it exactly if you choose it.
- Biome 2.5 is the best single binary, but it has no `no-unsafe-*` rules, which is Vex's main risk.

## A.7 Build, publish and quality notes

**tsdown config for Vex:**
```ts
export default defineConfig({
  entry: ["src/index.ts"], format: "esm", platform: "neutral",
  dts: { generator: "oxc" },                 // requires isolatedDeclarations; else "tsc" (TS 6 API)
  exports: true, publint: "ci-only", failOnWarn: "ci-only",
  attw: { enabled: "ci-only", profile: "esm-only", level: "error" },
});
```
- Sources: [lint](https://tsdown.dev/options/lint), [exports](https://tsdown.dev/options/package-exports), [format](https://tsdown.dev/options/output-format). The format docs say: "CJS is in maintenance-only mode… New libraries are encouraged to publish ESM-only".
- **Don't add `"sideEffects": false` yet**, even though publint suggests it. Adapters currently register op metadata through import side effects. Do Roadmap 2.1 (the adapter-owned op registry) first, or list the registering modules in `sideEffects`.

**Changesets 3 and the v2 action:** see the version table and §B.13.

**fast-check 4.10:**
- Use `chainUntil` (4.8) to grow well-typed builder chains step by step.
- Use the plugin API (4.10) for time-boxing.
- With `fc.check(..., { verbose: 1 })`, `RunDetails.failures` lists every failure seen during shrinking ([API](https://fast-check.dev/docs/api/interfaces/RunDetailsCommon/)). That is what the docs "Fuzz Arena" can animate.

**Stryker 10** ([vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)):
- The runner always uses per-test coverage and has no browser mode.
- Under Vitest 5, test names are joined with `>`, so per-test filters match nothing and scores collapse, e.g. 47 to 3 ([#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)). The fix, [PR #6214](https://github.com/stryker-mutator/stryker-js/pull/6214), is unreleased.
- Also open: pnpm workspace symlink failures ([#6243](https://github.com/stryker-mutator/stryker-js/issues/6243)) and no way to select one Vitest project ([#6215](https://github.com/stryker-mutator/stryker-js/issues/6215)).

**Type testing:** see §B.6. In short:
- Primary: Vitest `expectTypeOf` running under the TS 7 `tsc`.
- TSTyche on 5.9 and 6.0 for negative tests that check the error message.
- A consumer matrix across TS versions.
- `tsc --extendedDiagnostics` budgets. attest's TS 7 backend waits for 7.1.

**knip 6** reports unused catalog entries. With 2–4 packages, catalogs plus `catalogMode: strict` plus knip replace syncpack and manypkg.

**API reports:** api-extractor is blocked on its bundled TS 5.9.3. Instead, snapshot tsdown's bundled `dist/index.d.ts` with `toMatchFileSnapshot("api/vex.api.d.ts")` ([snapshot guide](https://vitest.dev/guide/snapshot)). That gives an API-diff gate for almost no work.

**TypeDoc and starlight-typedoc** must run in the TS 6 docs package. starlight-typedoc 0.23.1 needs Starlight ≥0.39, Astro ≥6, TypeDoc ≥0.28 and Node ≥22.12 ([CHANGELOG](https://github.com/HiDeoo/starlight-typedoc/blob/main/packages/starlight-typedoc/CHANGELOG.md)).

## A.8 Recommended pins

| Item | Pin |
|---|---|
| Package manager | `pnpm@12.10.1` (`packageManager`) |
| Node | Develop on 24.x (26.x after 2026-10-28); CI on 22, 24 and 26, plus a non-voting 27 alpha later |
| TypeScript | `typescript` → `npm:@typescript/typescript6@^6.0.2`; `@typescript/native` → `npm:typescript@~7.0.2`; docs package on `typescript@6.0.3` |
| Test | `vitest`/`@vitest/coverage-v8` ^5.0.3, `fast-check` ^4.10.2, `@fast-check/vitest` ^0.5.0, `tstyche` ^7.2.5 |
| Lint / format | `oxlint` ^1.87.0 + `oxlint-tsgolint` ^7.0.2003; optional `eslint` ^10.12 + `typescript-eslint` ^8.71.1; `prettier` ^3.9.9 |
| Build / release | `tsdown` ~0.23.0, `publint` ^0.3.25, `@arethetypeswrong/cli` ^0.18.5, `size-limit` ^14.2, `knip` ^6.40, `@changesets/cli` ^3.0.3 |
| Mutation | `@stryker-mutator/*` 10.0.0 in a lane on the `vitest4` catalog (4.1.11) until #6210 ships |

## A.9 Fitting this into your workspace conventions

- **Scaffolding.** Your workspace `CLAUDE.md` requires `node cli/dist/index.js lib new` and `cue-config`, with no hand-written `package.json` or `tsconfig.json`.
  - cue-config's feature list is git, npm, ts, react, node, node-cjs, vite, vite-react, cue and vitest.
  - There is no pnpm-workspace or catalog support (no matches in `cue/src` or `cli/src`), and no tsdown or Astro feature.
  - Treat the snippets in this report as the target outputs for new cue features: `pnpm-workspace` (root and catalogs), `tsdown`, `astro-starlight` and `oxlint`.
- **Portfolio parity.** `mark1russell7.github.io` already uses the same CI shape: action-setup v6, setup-node v7 with `cache: pnpm`, Node 26, and Pages artifact and deploy v5.
  - Its `allowBuilds` comment notes that since pnpm 11 any other dependency with an install script fails the install.
  - It runs `ste-lint` (ASD-STE100) on prose. Reuse that for the Vex docs prose and TSDoc.
- **Submodules.** `.gitmodules` uses SSH URLs.
  - Funk is imported by 15 files; concat-src is unused.
  - Both repos are public, so switch to `https://github.com/mark1russell7/Funk.git` and check out with `submodules: recursive`.
  - Better: vendor the roughly 90 lines of Funk you use (Roadmap 4.3) before the first publish.

## A.10 Uncertain (Part A)

- **TS 7.1 timing.** The beta was planned for 2026-10-06 but is not on npm. When TypeDoc, twoslash and typescript-eslint adopt the 7.1 API is unknown.
- **`typescript/unstable/*` in 7.0.2.** These subpaths are undocumented.
- **TS 6 runtime need.** The claim that twoslash, Shiki-twoslash and Stryker's checker need TS 6 at runtime is inferred from their in-process API use and peer ranges, not tested end to end.
- **Oxlint config keys** (`options.typeAware`, `options.typeCheck`) come from the docs and need a check against 1.87. tsgolint pins a TS patch version, so its behaviour on 7.1 is unknown.
- **oxfmt's conformance claim** is the project's own. Biome's lack of `no-unsafe-*` rules was checked only on its domains page.
- **Node schedule.** The Node 27 alpha date may change, and the Node 26 LTS codename is unpublished.
- **Vitest typecheck with TS 7** was verified on a toy project on Windows with Node 25.2.1, which is outside Vitest 5's engines. Vitest still calls typecheck experimental.
- **`oxc` declaration-emit fidelity** for Vex's complex inferred fluent types is unverified.
- **tsdown docs vs release notes.** The docs still say the attw default is `strict`; the 0.23 release notes say `esm-only`. I treated the release notes as authoritative.

---

# Part B: Testing and CI strategy

## B.0 Design principle: one trace, three consumers *(proposal)*

**Recommendation:** make the evaluator emit a serializable trace. Roadmap P3.4 is `chain.explain(start)`, which is about 50 lines once P2.4's dispatch table exists. The same JSON then becomes:
- **(a)** the golden test artifact;
- **(b)** the data every docs visualization renders;
- **(c)** the evidence attached to each conformance-matrix cell.

The trace also fixes the silent-`none` problem (V-004 and V-005), because every `none` carries a reason code.

```ts
type NoneReason =
  | { code: "VEX-E001"; kind: "missing-prop"; key: string; prop: string }
  | { code: "VEX-E002"; kind: "not-domain"; where: "self" | `arg${number}` }
  | { code: "VEX-E003"; kind: "unknown-op"; op: string }
  | { code: "VEX-E004"; kind: "arg-none"; arg: number; cause: NoneReason }
  | { code: "VEX-E005"; kind: "threw"; op: string; message: string }
  | { code: "VEX-E006"; kind: "invalid-switch"; to: string; keyCount: number }
  | { code: "VEX-E007"; kind: "upstream-none"; from: number };
interface TraceEvent {
  i: number; step: Step; span?: [number, number];        // span = source range of the fluent call (docs only)
  focusBefore: string; focusAfter: string;
  reads: { key: string; prop: string }[];                // tracer arrows / spreadsheet precedents
  locals?: Record<string, Snapshot>;
  out: { tag: "some"; value: Snapshot } | { tag: "none"; reason: NoneReason };
}
interface Trace { program: Step[]; scope: { kind: "map" | "array" | "matrix"; keys: string[] };
                  start: string | number; events: TraceEvent[] }
```

`Snapshot` would come from an optional `adapter.snapshot(d)`, plus an optional `adapter.view(d)` for docs rendering. The `view` idea comes from Glamorous Toolkit's "moldable" inspectors.

## B.1 Test pyramid for Vex

| Layer | Tools | What it catches (audit IDs from `docs/BUGS.md`, 2026-07-11; re-check) | Cadence |
|---|---|---|---|
| L0 Static | `tsc -b` (TS 7), oxlint type-aware, knip, API `.d.ts` snapshot | `any` surface (V-012), dead code, export drift | Every PR |
| L1 Unit | Vitest 5 | Optional helpers, scopes (map, array, matrix), `normalizeArgs` (§3.2), each step handler for success and each none-reason | Every PR |
| L2 Spec conformance | Case files + typed runner + known-failure ledger (§B.2) | V-001 (no `peers`), V-004/V-005 (silent focus failures), V-006 (locals disconnected), V-013 (strict-mode inconsistency) | Every PR |
| L3 Doc-tests | README and MDX code blocks extracted, executed **and** typechecked (§B.3) | Spec/code drift ("README is a spec that has drifted") | Every PR |
| L4 Property-based | fast-check 4 + `@fast-check/vitest` (§B.4) | Totality: V-007, V-008 (`toString` treated as an op), V-009 (`reduceBy` throws), V-022 (`some(undefined)`). Metadata laws: V-016 (`Color.add` "commutative"). Builder persistence: V-010. Differential checks. | PR at 100–200 runs; nightly soak |
| L5 Golden IR and traces | `toMatchFileSnapshot` + serializer (§B.5) | Unintended changes in meaning; also feeds the docs | Every PR |
| L6 Type-level | Vitest `expectTypeOf` (TS 7), TSTyche (5.9 and 6.0), consumer TS matrix, instantiation budgets (§B.6) | V-012, inference regressions, slow types | Every PR; budgets informational |
| L7 Package and consumer | build → `pnpm pack` → publint/attw → run conformance against the **tarball**; tree-shake and registration test; Vitest browser-mode smoke | V-003 (registration import elided), V-002 (cross-adapter metadata leak), V-032 | PR smoke; nightly browser run |
| L8 Mutation | Stryker on the kernel only (§B.7) | Weak assertions (V-037) | Per-PR `--dryRunOnly` tripwire; nightly full run |
| L9 Performance | Vitest 5 `bench` relative assertions; CodSpeed or github-action-benchmark on `main`; type-perf harness | Hot-path and type-checker regressions | PR informational; `main` tracked |

## B.2 Spec-conformance suite (test262 and CommonMark style)

**What test262 does.**
- Each test has YAML frontmatter: `esid` (spec anchor), `features` from [features.txt](https://github.com/tc39/test262/blob/main/features.txt), `includes` (harness), `flags` and `negative: {phase, type}` ([CONTRIBUTING](https://github.com/tc39/test262/blob/main/CONTRIBUTING.md)).
- By default each test runs twice, in strict and sloppy mode. A negative test fails if it completes or throws the wrong error in the wrong phase ([INTERPRETING](https://github.com/tc39/test262/blob/main/INTERPRETING.md)).
- Engines keep their own expectation ledgers, for example V8's [test262.status](https://github.com/v8/v8/blob/main/test/test262/test262.status).

**CommonMark** is the closest model for "the spec is the suite": its spec "contains over 500 embedded examples which serve as conformance tests" ([commonmark-spec](https://github.com/commonmark/commonmark-spec)).

**Adaptation for Vex:**
- Use typed `meta` exports instead of YAML.
- Replace the strict/sloppy double run with an `all-scopes` flag that runs each case over map, array and matrix fixtures.
- Negative cases become `expect: "none"` plus a `reason`. Type-phase negatives become `*.case-d.ts`.
- Keep a ledger of known failures run under `test.fails`. An unexpected pass then turns CI red ([test API](https://vitest.dev/api/test)).
- Emit JSON for the docs conformance matrix.

```ts
// spec/cases/dynamic/other-outside-pair.case.ts
export const meta = { id: "S5.1-other-requires-pair", spec: "§5.1, §6", features: ["scope", "axis.other"],
  flags: ["all-scopes"], expect: "none", reason: "invalid-switch" } as const satisfies CaseMeta;
export const run = (s: ScopeFixture) => s.chain({ A: s.A, B: s.B, C: s.C }).prop("position").other().value("A");

// packages/vex/test/conformance.test.ts
const cases = import.meta.glob<CaseModule>("../../../spec/cases/**/*.case.ts", { eager: true });
for (const { meta, run } of Object.values(cases))
  for (const scope of meta.flags?.includes("all-scopes") ? SCOPES : [SCOPES[0]]) {
    const t = ledger[meta.id] === "fail" ? test.fails : test;
    t(`${meta.spec} ${meta.id} [${scope.kind}]`, () => {
      const out = run(scope);                                  // any throw = §5 totality violation
      meta.expect === "none" ? expect(out).toBeNone(meta.reason) : expect(out).toEqualOptional(meta.expect);
    });
  }
```

Commit a pass-rate snapshot, as oxc does in [tasks/coverage](https://github.com/oxc-project/oxc/tree/main/tasks/coverage) with lines like "Positive Passed: 47455/47455". The docs matrix renders the same JSON.

## B.3 Doc-tests

| Tool (version) | Executes? | Typechecks? | Works with TS 7? | Notes |
|---|---|---|---|---|
| [typescript-docs-verifier](https://github.com/bbc/typescript-docs-verifier) 3.0.2 | No | Yes | No (TS API) | Compile-only |
| twoslash 0.3.9 in the docs build | No | Yes | No (peer ≤6) | Throws on unexpected errors unless `// @errors:` or `@noErrors` is set ([options](https://twoslash.netlify.app/refs/options)). A good docs-build gate on TS 6. |
| [@eslint/markdown](https://github.com/eslint/markdown) 8.0.3 | No | No | n/a | Lints fenced code only |
| Deno [`deno check --doc-only`](https://docs.deno.com/runtime/reference/documentation/) | `deno test --doc` | Yes | Own TS | Kysely uses it for JSDoc ([test.yml](https://github.com/kysely-org/kysely/blob/master/.github/workflows/test.yml)) |
| [vite-plugin-doctest](https://github.com/ssssota/doc-vitest) 3.0.0 | Yes | No | Needs TS 6 | Explicit `expect` in fences |
| [@effect/doctest](https://github.com/Effect-TS/effect/tree/main/packages/tools/doctest) 4.0.2 | Yes (Vitest 5) | No | Yes | `// =>` assertions; peer-depends on `effect` |
| fast-check's [Docs.md.spec.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/test/documentation/Docs.md.spec.ts) | Yes | n/a | Yes | Self-updating snippet outputs |

**Recommendation: a small extractor of your own.** It works on TS 7 and gives exact control over spec IDs.
- Fences tagged `spec=…` in README.md and the site MDX are written to a gitignored `.doctest/**.test.ts`.
- A `doctest` Vitest project runs those files, and TS 7 `tsc -p tools/doctest` typechecks them.
- Content above `// ---cut---` is setup, which twoslash and Expressive Code can hide on the site.

```ts
// tools/doctest/extract.ts
import { fromMarkdown } from "mdast-util-from-markdown";   // add mdxjs extensions for .mdx
import { visit } from "unist-util-visit";
for (const file of await glob(["README.md", "apps/site/src/content/**/*.{md,mdx}"])) {
  let i = 0;
  visit(fromMarkdown(await readFile(file, "utf8")), "code", (node) => {
    const spec = /\bspec=(\S+)/.exec(node.meta ?? "")?.[1];
    if (node.lang !== "ts" || !spec) return;
    const body = node.value.replace(/^(\s*)(.+?);?\s*\/\/ => (.+)$/gm, "$1expect($2).toEqual($3);");
    write(`.doctest/${slug(file)}/${spec}-${i++}.test.ts`,
      `${PREAMBLE}\ntest(${JSON.stringify(`${file} §${spec} (L${node.position!.start.line})`)}, () => {\n${body}\n});\n`);
  });
}
```

## B.4 Property-based testing with fast-check 4

**1. Totality fuzzing.**
- Generate IR from the grammar (§3/§5/§19) with `fc.letrec`, using `depthSize` and `withCrossShrink` ([recursive structures](https://fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/)).
- Feed hostile names deliberately: `__proto__`, `constructor`, `toString`, `valueOf`. Use `fc.double()` for NaN, ±Infinity and -0.
- The scope arbitrary should include adversarial domain objects: methods that throw (`Error`, `42`, `undefined`), methods that return `undefined` or `NaN`, throwing getters, throwing Proxies, and null-prototype objects (included by default since 4.0).

```ts
export const { program } = fc.letrec<{ program: Step[]; step: Step; arg: ArgRef }>((tie) => ({
  program: fc.array(tie("step"), { maxLength: 10 }),
  step: fc.oneof({ depthSize: "small", withCrossShrink: true },
    fc.record({ tag: fc.constant("Select" as const), prop }),
    fc.record({ tag: fc.constant("Switch" as const), to: fc.oneof(
      fc.record({ tag: fc.constant("Self" as const), key: fc.oneof(key, fc.integer({ min: -2, max: 5 })) }),
      fc.record({ tag: fc.constant("Other" as const), key: fc.option(key, { nil: undefined }) })) }),
    fc.record({ tag: fc.constant("Invoke" as const), op, args: fc.array(tie("arg"), { maxLength: 3 }) })),
  arg: fc.oneof({ depthSize: "small" },
    fc.record({ tag: fc.constant("ConstS" as const), n: fc.double() }),
    fc.record({ tag: fc.constant("ConstD" as const), v: fc.anything() }),       // V-007
    fc.record({ tag: fc.constant("PropRef" as const), name: prop }),
    fc.record({ tag: fc.constant("OfRef" as const), k: key, p: prop }),
    fc.constant({ tag: "Current" as const }),
    fc.record({ tag: fc.constant("NestedExpr" as const), steps: tie("program") })),
}));
test.prop([program, scopeArb, fc.constantFrom("A", "B", 0, 9, "nope")])(
  "§5/§6 totality: never throws, always Optional, never some(undefined)", (steps, scope, start) => {
    const out = evaluate(steps, scope, start);
    expect(isOptional(out)).toBe(true);
    if (isSome(out)) expect(out.value).not.toBeUndefined();     // V-022
  });
```

**2. Laws driven by metadata (§14).**
- For each op flagged `commutative` or `associative`, generate integer-valued vectors and check the law. Floating-point `add` is not associative, so otherwise use a ULP tolerance.
- Check the Optional monad laws with `fc.func`.
- Check the Appendix A equivalences as metamorphic relations, e.g. `traverse(E).map(F) ≡ traverse(x => F(E(x)))`.

**3. Differential oracles.** Zod reruns its whole suite in "compile mode" to catch any divergence between two execution paths ([vitest.compile.config.ts](https://github.com/colinhacks/zod/blob/main/vitest.compile.config.ts)). For Vex, check all of these against each other:
- the `._` proxy surface;
- the IR built and then evaluated;
- a deliberately naive `referenceEval` of about 100 lines, written straight from §5;
- memoized evaluation versus none (§17 says caching MUST NOT alter semantics).

**4. Model-based testing of builder chains** ([docs](https://fast-check.dev/docs/advanced/model-based-testing/)).
- Every command is legal, because Vex is total, so the model also predicts `none`.
- After each command, assert that the IR matches the model and that earlier snapshots are unchanged. That second check is persistence (V-010).
- To generate only well-typed chains, use `fc.chainUntil` (4.8, [post](https://fast-check.dev/blog/2026/06/25/whats-new-in-fast-check-4-8-0/)).

```ts
class PropCmd implements fc.Command<Model, Real> {
  constructor(readonly p: string) {}
  check = () => true;
  run(m: Model, r: Real) {
    r.snapshots.push([r.chain, structuredClone(r.chain.toIR())]);
    r.chain = r.chain.prop(this.p); m.steps.push({ tag: "Select", prop: this.p });
    expect(r.chain.toIR()).toEqual(m.steps);                                // §9.1 surface pushes normalized IR
    for (const [old, ir] of r.snapshots) expect(old.toIR()).toEqual(ir);    // persistence (V-010)
  }
  toString = () => `.prop(${JSON.stringify(this.p)})`;
}
// + SelfCmd/OtherCmd (invalid switch ⇒ none), InvokeCmd, LocalSet/Get (V-006), EvalCmd (vs referenceEval)
test.prop([fc.commands([propCmd, selfCmd, otherCmd, invokeCmd, localCmds, evalCmd], { size: "+1" })])(
  "builder ≡ model", (cmds) => fc.modelRun(setup, cmds));
```

**5. Seeds and run counts.**
- Copy fast-check's own CI ([build-status.yml](https://github.com/dubzzz/fast-check/blob/main/.github/workflows/build-status.yml), [vitest.setup.mjs](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/vitest.setup.mjs)):
  - generate and log a random `DEFAULT_SEED`;
  - apply it with `fc.configureGlobal({ seed })`;
  - fail CI if no seed is set.
- Replay a failure with the printed `{ seed, path, endOnFailure: true }` ([reports](https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/)).
- Promote each counterexample to a fixture.
- Run counts: 100–200 on PRs; 10k+ nightly, time-boxed with the 4.10 plugin; a fixed seed and low run count under Stryker.
- Bonus: OpenSSF Scorecard's Fuzzing check counts fast-check property tests ([checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md)).

## B.5 Golden IR and trace snapshots

- For each normative program (§18.1–18.3, Appendix B) and each start key, snapshot the IR JSON and the rendered trace: `await expect(render(trace)).toMatchFileSnapshot("./__golden__/18.1.A.trace")`. It must be awaited in Vitest 5.
- Register a serializer through `snapshotSerializers` ([guide](https://vitest.dev/guide/snapshot)).
- CI never writes snapshots.
- **Precedents:**
  - TypeScript keeps baselines in `local/` versus `reference/` and has an accept step ([CONTRIBUTING](https://github.com/microsoft/TypeScript/blob/main/CONTRIBUTING.md)).
  - Babel uses `input.js`/`output.js`/`exec.js` fixtures with `OVERWRITE=true` ([CONTRIBUTING](https://github.com/babel/babel/blob/main/CONTRIBUTING.md)).
  - fast-check's [NoRegression.spec.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/test/NoRegression.spec.ts) snapshots the values generated under `seed: 42`. Do the same for a seeded corpus of random programs and their traces.

## B.6 Type-level tests for the fluent API

```ts
// chain.test-d.ts — Vitest typecheck (spawns TS 7 tsc)
test("surface is typed, not any (V-012)", () => {
  const c = vectorMapChain({ A, B });
  expectTypeOf(c).not.toBeAny();
  expectTypeOf(c.prop("position")._.add("size").value("A")).toEqualTypeOf<Optional<Vector>>();
  // @ts-expect-error — "C" is not a key of {A,B}
  c.value("C");
});
// chain.tst.ts — TSTyche on 5.9 || 6.0: message-checked negatives
test("prop() rejects unknown props", () => {
  expect(vectorMapChain({ A, B }).prop).type.not.toBeCallableWith("nope");
  // @ts-expect-error Argument of type '"nope"' is not assignable to parameter of type ...
  vectorMapChain({ A, B }).prop("nope");
});
```

- **Pitfall:** under Vitest, any error satisfies `@ts-expect-error`, including a typo ([guide](https://vitest.dev/guide/testing-types)). That is fatal for DSL negative tests, so use TSTyche's message matching or `.not.toBeCallableWith` ([expect-errors](https://tstyche.org/guides/expect-errors)).
- **Consumer TS matrix.** This is ArkType's pattern ([testTsVersions.ts](https://github.com/arktypeio/arktype/blob/main/ark/repo/testTsVersions.ts)).
  - A `tests/ts-compat` fixture compiles against the **built** `.d.ts` with TS 5.9, 6.0, 7.0 and `next`.
  - Install each version under an `npm:` alias and run it with `node node_modules/<alias>/bin/tsc`, so everything stays lockfile-pinned (no `dlx`).
- **Instantiation budgets.**
  - Copy Effect's [typeperf harness](https://github.com/Effect-TS/effect/tree/main/packages/effect/typeperf): `tsc --extendedDiagnostics` on TS 7, maximum deltas stored per fixture, accepted with `--update`. A good fixture is a 12-step chain over keys `A..Z`.
  - `@ark/attest` `bench().types([n, "instantiations"])` waits for TS 7.1 ([benches](https://arktype.io/docs/attest/benches)).
  - Kysely even benchmarks error paths, such as the instantiation cost of a `@ts-expect-error` select ([select.bench.ts](https://github.com/kysely-org/kysely/blob/master/test/ts-benchmarks/select.bench.ts)).

## B.7 Mutation testing gate

- Mutate only the pure kernel: IR, evaluator, Optional and scopes.
- Copy Gusto's setup ([mutation-testing.md](https://github.com/Gusto/baerly-storage/blob/main/docs/contributing/mutation-testing.md)):
  - a dedicated single-project Stryker Vitest config;
  - per-test coverage with an incremental file;
  - a ~20-second `stryker run --dryRunOnly` tripwire on every PR. Their full run "sat broken for a month" before they added it.
- Incremental mode ([docs](https://stryker-mutator.io/docs/stryker-js/incremental/)): cache the file from `main`, run `--incremental` nightly, and run `--force` weekly.
- Thresholds: `{ high: 90, low: 75, break: 70 }`, applied **only after** #6210 is fixed. Until then, use a `tools/mutation` lane on the `vitest4` catalog, or carry PR #6214 as a `pnpm patch`.

## B.8 Benchmarks and coverage

- **PRs:** Vitest 5 `bench.compare()` with `toBeFasterThan(…, { delta: 0.1 })` (relative, robust to noisy runners). Example comparisons: proxy `._` versus prebuilt IR versus a hand-written baseline, and traversal over 10⁵ keys (V-029).
- **`main`:**
  - CodSpeed through `@codspeed/tinybench-plugin` 5.7.1 (peer `tinybench >=4.0.1`). The Vitest plugin's peer is `^3.2 || ^4` even in 6.0.0-beta.2.
  - Or [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) with `writeResult` JSON.
  - CodSpeed's free plan is aimed at OSS ([pricing](https://codspeed.io/pricing)).
- **Coverage:**
  - Per-glob thresholds as in §A.5. In Vitest 5 each glob needs its own `perFile`.
  - Locally, `autoUpdate` ratchets the thresholds upward ([config](https://vitest.dev/config/coverage)).

## B.9 CI cadence

| When | Jobs |
|---|---|
| **PR, required (≤10 min)** | TS 7 `tsc -b`; oxlint; Vitest projects (unit, conformance, doctest, property tests with a logged seed) on Node 22/24/26; typecheck plus TSTyche; coverage gates; golden snapshots; build → pack → publint/attw → conformance run against the tarball; tree-shake and registration test; Stryker dry run; docs build (twoslash gate on TS 6) |
| **PR, informational** | Type-perf delta comment; relative bench table; bundle-size comment via a `workflow_run` job (Effect's fork-safe [bundle-comment.yml](https://github.com/Effect-TS/effect/blob/main/.github/workflows/bundle-comment.yml)); pkg.pr.new preview |
| **Push to `main`** | Release flow; Pages deploy; refresh the Stryker incremental cache; CodSpeed tracking |
| **Nightly** | Property-test soak (several seeds, 10k+ runs, opens an issue with seed and path); full Stryker run; `typescript@next` compat and type tests; Vitest browser-mode conformance; full type-perf suite |

## B.10 Example projects (repos inspected directly)

| Project | Type tests | Multiple TS versions | Doc-tests | Package checks | Perf / size | Worth copying |
|---|---|---|---|---|---|---|
| **Effect 4** (4.0.0 on 2026-10-01; [Effect-TS/effect](https://github.com/Effect-TS/effect) `packages/effect`) | TSTyche `*.tst.ts` ([tstyche.json](https://github.com/Effect-TS/effect/blob/main/tstyche.json)) | `tstyche --target '>=5.9'`; workspace on TS ^7.0.2 | `@effect/doctest` ([vitest.docs.ts](https://github.com/Effect-TS/effect/blob/main/vitest.docs.ts)) | [check-dist-types](https://github.com/Effect-TS/effect/blob/main/scripts/check-dist-types.mjs) compiles the built `.d.ts` with `skipLibCheck:false`; API diff | Bundle size versus base; typeperf budgets | Node/Deno/Bun matrix; a "generated docs up to date" check ([check.yml](https://github.com/Effect-TS/effect/blob/main/.github/workflows/check.yml)) |
| **Zod** ([colinhacks/zod](https://github.com/colinhacks/zod)) | Vitest typecheck on the same test files | Matrix 5.5 / 6 / latest ([test.yml](https://github.com/colinhacks/zod/blob/main/.github/workflows/test.yml)) | — | attw; resolution and integration packages | Bundle-size ceiling with a `MUST_NOT_APPEAR` list ([bundle-size.test.ts](https://github.com/colinhacks/zod/blob/main/packages/treeshake/bundle-size.test.ts)) | Compile-mode differential project; [fail-on-console](https://github.com/colinhacks/zod/blob/main/scripts/fail-on-console.ts); a seeded fuzzer kept out of CI ([compile-fuzz.ts](https://github.com/colinhacks/zod/blob/main/scripts/compile-fuzz.ts)) |
| **ArkType** ([arktypeio/arktype](https://github.com/arktypeio/arktype)) | `@ark/attest` snapshots of type strings, errors and completions ([assertions](https://arktype.io/docs/attest/assertions)) | Dynamic matrix 5.1.6 / 5.9.3 / 6.0.3 / 7.0.2 ([pr.yml](https://github.com/arktypeio/arktype/blob/main/.github/workflows/pr.yml)) | Docs build in PR checks | knip; ESLint `--max-warnings=0` | CI fails on type-instantiation regressions | TS 6 catalog plus pnpmfile; [testV8.js](https://github.com/arktypeio/arktype/blob/main/ark/repo/testV8.js) asserts `%HasFastProperties` |
| **Kysely** ([kysely-org/kysely](https://github.com/kysely-org/kysely)) | `tsd` | ~5.4 / ~5.8 / ~5.9, each via the matching tsd; main build on TS 7.0.2 plus a TS 6 alias | `deno check --doc-only` | `attw --profile esm-only`; export and ESM-import checks | attest type benchmarks with a PR comment ([bench.yml](https://github.com/kysely-org/kysely/blob/master/.github/workflows/bench.yml)) | harden-runner, SHA pins, zizmor and Scorecard; Node 22/24/26 plus Deno, Bun, browser and Workers |
| **optics-ts** ([akheron/optics-ts](https://github.com/akheron/optics-ts)) | Implicit, via tsc | None | — | — | — | **Dormant** (2.4.1, 2023-07). Its `optic_<S>().prop("foo")` chain is the closest API analogue to Vex. |
| **fast-check** ([dubzzz/fast-check](https://github.com/dubzzz/fast-check)) | `tsc --noEmit` (TS ~7.0.2) plus api-extractor | Single TS; Node 22/24/latest | Self-updating snippet outputs | `publint --strict`; tests run against packed tarballs | Vitest bench with `BENCH_WRITE`/`BENCH_COMPARE` | Mandatory logged seed; NoRegression snapshot; `@fast-check/poisoning`; oxlint-tsgolint |

## B.11 GitHub Actions in late 2026: what changed

- **Node 20 is gone** from runners (2026-09-23, [changelog](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions)). `andresz1/size-limit-action` still declares `node20`, so call the size-limit CLI instead.
- **checkout v7** (2026-06-18) blocks fork-PR checkouts under `pull_request_target` and `workflow_run`. The change was backported to v2–v6 on 2026-07-20; SHA-pinned workflows only get it after a bump ([changelog](https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout/)).
- **setup-node** ([releases](https://github.com/actions/setup-node/releases)):
  - v5 moved to the node24 runtime.
  - v6 limits automatic caching to npm, so pnpm needs `cache: pnpm`.
  - v6.3 reads `devEngines.runtime`.
  - v7.0 is ESM and removed the dummy `NODE_AUTH_TOKEN`; its docs say to disable caching in publish workflows.
  - v7.1 (today) adds `mise.toml` support.
- **pnpm/action-setup** v6.1.0 supports pnpm 12 and reads `packageManager`. Don't also pass `version:`, because a mismatch is an error ([releases](https://github.com/pnpm/action-setup/releases)). `pnpm/setup@v3` is a newer one-step alternative, but it is very young.
- **Affected-only runs.** For 2–5 packages, skip Turborepo and Nx. Use `pnpm --filter "...[origin/main]"` for expensive jobs only; since pnpm 12.7 it compares against the merge base ([filtering](https://pnpm.io/filtering)). Turborepo 2.11 `--affected` and Nx 23 (with `nx-set-shas@v5.0.1`) need deep checkouts.
- **SHA-pinning policy** has been enforceable since 2025-08-15 ([changelog](https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/)).
- **Required checks.** Use one aggregate job with `re-actors/alls-green@v1.3.0`, which also fails on skipped prerequisites.
  - A merge queue needs a `merge_group` trigger. It appears to be limited to repos owned by organizations, and Vex is a personal repo, so this is uncertain.
- **CodeQL Action v3 retires in December 2026.** Use v4.38.x ([changelog](https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/)). Default setup is enough and also scans workflow files.
- **Don't use `withastro/action` in a monorepo.** It looks for the lockfile only inside `path`, so it can't see the root `pnpm-lock.yaml` ([action.yml](https://github.com/withastro/action/blob/main/action.yml)). Use explicit steps, as your portfolio pages.yml already does.
- **deploy-pages `preview`** is still "alpha… not available to the public", so docs PR previews need Netlify, Cloudflare or Vercel.
- **GitHub Pages limits** ([docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)): 1 GB site, 10-minute deploy timeout, 100 GB a month soft bandwidth, and no custom headers.

## B.12 Workflow sketches

Action SHAs were resolved from their release tags on 2026-10-08. If Funk stays a submodule, add `submodules: recursive` to every checkout and switch `.gitmodules` to HTTPS.

```yaml
# .github/actions/setup/action.yml — shared setup (call after checkout)
name: setup
description: pnpm (from "packageManager") + Node + frozen install
inputs:
  node-version: { description: "empty = .node-version", default: "" }
  cache: { description: "'pnpm' or '' (use '' in release jobs)", default: "pnpm" }
runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
    - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
      with:
        node-version: ${{ inputs.node-version }}
        node-version-file: ${{ inputs.node-version == '' && '.node-version' || '' }}
        cache: ${{ inputs.cache }}
    - run: pnpm install --frozen-lockfile
      shell: bash
```

```yaml
# .github/workflows/ci.yml
name: CI
on: { pull_request: {}, merge_group: {}, push: { branches: [main] }, workflow_dispatch: {} }
permissions: {}
concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - run: pnpm lint && pnpm format:check && pnpm knip
      - uses: raven-actions/actionlint@3d39aea434753780c3b3d4a1a31c854b4dbf49d7 # v2.2.0
  types:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - run: pnpm typecheck          # TS 7 tsc -b
      - run: pnpm test:types         # vitest --typecheck (TS 7) + tstyche (5.9 || 6.0)
  test:
    name: test (node ${{ matrix.node }})
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions: { contents: read }
    strategy: { fail-fast: false, matrix: { node: [22, 24, 26] } }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
        with: { node-version: "${{ matrix.node }}" }
      - name: Assert scripts run on the matrix Node
        env: { WANT: "${{ matrix.node }}" }
        run: pnpm exec node -e "process.exit(process.versions.node.startsWith(process.env.WANT + '.') ? 0 : 1)"
      - run: pnpm test:ci            # vitest run --coverage (unit, conformance, doctest, pbt w/ logged seed)
      - if: matrix.node == 24
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with: { name: coverage, path: "packages/*/coverage/", retention-days: 7 }
  package:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - run: pnpm build
      - run: pnpm -r --filter "./packages/*" exec pnpm pack --pack-destination "$RUNNER_TEMP/packs"
      - name: publint + attw on the real tarballs (attw --pack can't use pnpm)
        run: |
          for t in "$RUNNER_TEMP"/packs/*.tgz; do
            pnpm exec publint "$t" --strict
            pnpm exec attw "$t" --profile esm-only
          done
      - run: pnpm size && pnpm test:tarball   # conformance suite re-run against the unpacked tarball
  ts-compat:
    name: ts-compat (${{ matrix.ts }})
    needs: package
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read }
    strategy: { fail-fast: false, matrix: { ts: [ts59, ts60, ts70] } }   # npm: aliases in tests/ts-compat
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - run: pnpm build && pnpm --filter ts-compat exec node node_modules/${{ matrix.ts }}/bin/tsc -p . --noEmit
  docs:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - run: pnpm test:docs                          # doctest extraction + playwright smoke
      - run: pnpm --filter "@vex/site..." build      # twoslash (TS 6) fails the build on type errors
  preview:
    if: github.event_name == 'pull_request'
    needs: package
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - run: pnpm build && pnpm exec pkg-pr-new publish --pnpm './packages/*'
  ci-ok:
    name: CI OK
    if: always()
    needs: [lint, types, test, package, ts-compat, docs]
    runs-on: ubuntu-latest
    timeout-minutes: 2
    permissions: {}
    steps:
      - uses: re-actors/alls-green@b5b5b37504aa4183270bd3d855c52a67f212be35 # v1.3.0
        with: { jobs: "${{ toJSON(needs) }}" }
```

```yaml
# .github/workflows/release.yml — npm trusted publisher: file=release.yml, environment=npm, direct publish allowed
name: Release
on: { push: { branches: [main] } }
permissions: {}
concurrency: { group: "release-${{ github.ref }}", cancel-in-progress: false }
jobs:
  select-mode:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read }
    outputs:
      mode: ${{ steps.mode.outputs.mode }}
      publish-plan-artifact-id: ${{ steps.mode.outputs.publish-plan-artifact-id }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: ./.github/actions/setup
        with: { node-version: "24", cache: "" }
      - id: mode
        uses: changesets/action/select-mode@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2
  version:
    needs: select-mode
    if: needs.select-mode.outputs.mode == 'version'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: write, pull-requests: write }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: ./.github/actions/setup
        with: { node-version: "24", cache: "" }
      - uses: changesets/action/version@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2
        with:
          script: pnpm run version-packages   # changeset version (&& sync jsr.json if JSR is adopted)
          # github-token: GitHub App token (actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0)
          # so that CI runs on the "Version Packages" PR (GITHUB_TOKEN-created PRs don't trigger workflows)
  pack:
    needs: select-mode
    if: needs.select-mode.outputs.mode == 'publish'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions: { contents: read }
    outputs:
      pack-dir-artifact-id: ${{ steps.pack.outputs.pack-dir-artifact-id }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
        with: { node-version: "24", cache: "" }
      - run: pnpm build
      - id: pack
        uses: changesets/action/pack@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2
        with: { publish-plan-artifact-id: "${{ needs.select-mode.outputs.publish-plan-artifact-id }}" }
  publish:
    needs: pack
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: npm                       # required reviewer = you (human gate, Changesets can't stage)
    permissions: { contents: write, id-token: write }
    steps:
      - uses: step-security/harden-runner@ccd8616d44fd3846e67624a50d5aad6d37bf2d25 # v2.22.1
        with: { egress-policy: audit }
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: ./.github/actions/setup            # no registry-url (OIDC); no cache in publish jobs
        with: { node-version: "24", cache: "" }
      - id: publish
        uses: changesets/action/publish@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2
        with:
          pack-dir-artifact-id: ${{ needs.pack.outputs.pack-dir-artifact-id }}
          create-github-releases: true
```

```yaml
# .github/workflows/pages.yml
name: Pages
on:
  push:
    branches: [main]
    paths: ["apps/site/**", "packages/**", "spec/**", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".github/workflows/pages.yml"]
  workflow_dispatch:
permissions: {}
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions: { contents: read, pages: read }   # grant pages: write if configure-pages complains
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false, submodules: recursive }
      - uses: ./.github/actions/setup
      - id: pages
        uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0
      - run: pnpm --filter "@vex/site..." build
        env:
          SITE_ORIGIN: ${{ steps.pages.outputs.origin }}
          SITE_BASE: ${{ steps.pages.outputs.base_path }}   # astro.config: base: process.env.SITE_BASE ?? '/Vex'
      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        with: { path: apps/site/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { pages: write, id-token: write }
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

```yaml
# .github/workflows/security.yml  (drop the codeql job if CodeQL default setup is enabled — can't run both)
name: Security
on: { push: { branches: [main] }, pull_request: {}, schedule: [{ cron: "27 4 * * 1" }] }
permissions: {}
jobs:
  codeql:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions: { contents: read, security-events: write, actions: read }
    strategy: { fail-fast: false, matrix: { language: [javascript-typescript, actions] } }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: github/codeql-action/init@24c54180a607b1449ed407dd24f251e4e9147c8d # v4.38.3
        with: { languages: "${{ matrix.language }}", build-mode: none, queries: security-extended }
      - uses: github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d # v4.38.3
        with: { category: "/language:${{ matrix.language }}" }
  zizmor:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions: { contents: read, security-events: write }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: zizmorcore/zizmor-action@cc914d7f3750a2d13d75c7f184a1060aa0e9d482 # v0.6.4
  scorecard:
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions: { contents: read, actions: read, security-events: write, id-token: write }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: ossf/scorecard-action@2d1146689b8cda280b9bc96326124645441f03bc # v2.4.4
        with: { results_file: results.sarif, results_format: sarif, publish_results: true }
      - uses: github/codeql-action/upload-sarif@24c54180a607b1449ed407dd24f251e4e9147c8d # v4.38.3
        with: { sarif_file: results.sarif }
```

**Nightly `quality.yml`** *(proposal; reuses the setup above):*
- Property-test soak: `FC_NUM_RUNS=20000` plus a time limit, read by `fc.configureGlobal` in the Vitest setup. On failure, open an issue with the seed and path.
- Stryker `--incremental`, with `reports/stryker-incremental.json` cached via `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0`, in the `vitest4` lane.
- `tests/ts-compat` against `typescript@next`.
- Vitest browser-mode conformance.
- CodSpeed: `CodSpeedHQ/action@c4fd08a3a159bd0cc208da1e0edf32b8c47d75e5 # v5.4.0` with the tinybench plugin.

```json
// renovate.json — Renovate over Dependabot: Dependabot maintainers "don't officially support pnpm 11 or 12" (#16397)
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:best-practices", "config:js-lib", ":semanticCommitTypeAll(chore)", "schedule:weekly"],
  "dependencyDashboard": true,
  "internalChecksFilter": "strict",
  "postUpdateOptions": ["pnpmDedupe"],
  "packageRules": [
    { "matchDatasources": ["npm"], "minimumReleaseAge": "3 days" },
    { "matchManagers": ["github-actions"], "groupName": "GitHub Actions", "minimumReleaseAge": "7 days" },
    { "matchDepTypes": ["devDependencies", "pnpm.catalog.default"],
      "matchUpdateTypes": ["minor", "patch", "digest", "pinDigest"], "automerge": true },
    { "matchPackageNames": ["typescript", "@typescript/native", "vitest", "/^@vitest\\//", "tsdown", "@changesets/cli"],
      "matchUpdateTypes": ["major", "minor"], "dependencyDashboardApproval": true }
  ]
}
```

- Renovate supports pnpm catalogs, with dependency type `pnpm.catalog.<name>` ([PR #33376](https://github.com/renovatebot/renovate/pull/33376)).
- It does **not** read pnpm's `minimumReleaseAge`, so set the age in both places ([docs](https://docs.renovatebot.com/key-concepts/minimum-release-age/)).
- Dependabot problems:
  - Its docs list only pnpm 7–10.
  - pnpm 12 lockfile and catalog bugs are open ([#15904](https://github.com/dependabot/dependabot-core/issues/15904), [#16311](https://github.com/dependabot/dependabot-core/issues/16311)).
  - pnpm 11's 1-day release-age gate breaks its PRs.
- Keep Dependabot **alerts** switched on.

## B.13 Publishing

**npm timeline**

| Date | Fact |
|---|---|
| 2025-07-31 | Trusted publishing (OIDC) GA. Needs npm ≥11.5.1 and Node ≥22.14. Provenance is automatic from a public repo; no self-hosted runners ([changelog](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)). |
| 2025-11-05 | Classic token creation disabled; write tokens capped at 90 days ([changelog](https://github.blog/changelog/2025-11-05-npm-security-update-classic-token-creation-disabled-and-granular-token-changes/)) |
| 2025-12-09 | **Classic tokens revoked**; `npm login` gives 2-hour sessions ([changelog](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/)) |
| 2026-05-22 | Staged publishing GA: `npm stage publish` plus human 2FA approval ([changelog](https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/)) |
| 2026-07-08 | npm 12: install scripts and git/remote dependencies become opt-in; tokens that bypass 2FA are being deprecated ([changelog](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation)) |
| 2026-09-03 | Multiple trusted-publisher configs per package; **new configs allow staging only by default, and direct publish is opt-in** ([changelog](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)) |
| 2026-09-30 | Opt-in permission to manage dist-tags via OIDC ([changelog](https://github.blog/changelog/2026-09-30-opt-in-dist-tag-permissions-for-npm-trusted-publishing)) |

- **pnpm as publisher.** pnpm ≥11 publishes natively with OIDC, which wins over a static token since 11.0.7 ([11.0.7](https://github.com/pnpm/pnpm/releases/tag/v11.0.7)). Provenance under OIDC is generated in its source code but not documented, so check the provenance badge after the first release.
- **Changesets 3** publishes through the repo's own package-manager CLI. Changesets does not support staged publishing yet ([guide](https://changesets.dev/guide/automating)).

**First-publish checklist:**
1. **Name.** Unscoped `vex` is taken (0.0.4, a 2022 schema validator). `@mark1russell7/vex` was free on 2026-10-08. Set `publishConfig.access: "public"` and `repository.url` exactly to `mark1russell7/Vex` (npm matches it case-sensitively).
2. **Create the package.** It must exist before a trusted publisher can be configured. Either `npm publish` locally with 2FA, or `npm stage publish` and approve it.
3. **Configure the trusted publisher.** Run `npm trust github @mark1russell7/vex --file release.yml --repo mark1russell7/Vex --env npm --allow-publish` (npm ≥11.15, [docs](https://docs.npmjs.com/cli/v11/commands/npm-trust)).
4. **Add a human gate.** Make yourself a required reviewer on the `npm` environment.
5. **Close the token path.** After the first OIDC publish, set "Require 2FA and disallow tokens".

**JSR** ([publishing](https://jsr.io/docs/publishing-packages), [slow types](https://jsr.io/docs/about-slow-types)):
- It needs `id-token: write` and `jsr publish` (CLI 0.14.3). Provenance only comes from OIDC publishes.
- The "no slow types" rule is close to `isolatedDeclarations`.
- **Verdict:** defer JSR until the typed surface (P3.2) settles. Keep `isolatedDeclarations` on so JSR becomes about an hour of work later. Deno and Bun users can already use `npm:`.

**Previews and attestations.**
- pkg.pr.new publishes installable builds per PR. Use `--pnpm` so `workspace:` and `catalog:` get rewritten ([README](https://github.com/stackblitz-labs/pkg.pr.new)).
- `attest-build-provenance` v4 is now a wrapper around `actions/attest`. It is only needed if you attach artifacts to GitHub Releases.

## B.14 One-time repository settings

- **Actions:** default workflow token read-only; allow Actions to create and approve PRs.
- **Pages:** set the source to "GitHub Actions". Pages is currently disabled on `mark1russell7/Vex`; the site URL will be `https://metrograph-labs.github.io/vex/`.
- **Environments:** `npm` (with a required reviewer) and `github-pages`.
- **Ruleset on `main`:** require a PR, require the "CI OK" check, require CodeQL and zizmor code-scanning results, and block force-push and deletion.
- **Apps:** install Renovate and pkg.pr.new.
- **Scorecard files:** add `SECURITY.md` and the bestpractices.dev badge.

## B.15 Uncertain (Part B)

- **Stryker fix timing** (#6210/#6214) is unknown. Until then, scores are *wrong* rather than red.
- **TS 7.1 API timing** is unknown; it would remove the TS 6 requirement for several tools.
- **@ark/attest on TS 7** is unclear: ArkType records snapshots with TS 7, but Kysely pins TS 6 for attest.
- **Vitest 5 bench API** is brand new, so expect churn. The obsolete-snapshot CI failure behaviour comes from the guide's wording and should be confirmed on the first run.
- **CodSpeed's tinybench plugin with tinybench 6** is untested.
- **Merge queue and rulesets on a personal-account repo:** eligibility is unclear.
- **pnpm OIDC provenance and `pnpm stage` with OIDC** are not documented.
- **Renovate's dependency-type name** for the default catalog is assumed to be `pnpm.catalog.default`.
- **Audit IDs** come from the 2026-07-11 audit and may be partly fixed.
- **configure-pages with only `pages: read`** may need `pages: write`.

---

# Part C: Creative, interactive documentation for Vex

## C.1 Best-in-class examples and what to steal

All links were checked for status on 2026-10-08. Vex vocabulary: IR steps (Select, Switch, Invoke, locals), scopes (map, array, matrix), axes (self, other, peers, traverse), and Optional results (some, none).

**Explorable essays and their theory**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| Bret Victor, [Explorable Explanations](https://worrydream.com/ExplorableExplanations/) and [Tangle](https://worrydream.com/Tangle/) | Reactive documents (2011, postscript 2024) | Scrubbable numbers in prose: "B sits **3** units right of A" re-evaluates the inline chain result. Hover `other()` anywhere for its definition. |
| Bret Victor, [Learnable Programming](https://worrydream.com/LearnableProgramming/) | "Each line of code that is executed leaves a dot behind"; "show the data"; "eliminate hidden state" | Each IR step leaves a dot on a timeline. Focus and locals are always visible. |
| Bret Victor, [Up and Down the Ladder of Abstraction](https://worrydream.com/LadderOfAbstraction/) | Concrete run → abstraction over time → abstraction over parameters | Three rungs: (1) the trace for key A; (2) small multiples per key, which is what `traverse` means; (3) a parameter sweep plot. Clicking a point drops back to rung 1. |
| Nicky Case: [explorabl.es](https://explorabl.es/) hub, [Nutshell](https://ncase.me/nutshell/) | Hub "for learning through play"; Nutshell is expandable inline definitions (pushed 2025-12) | Nutshell-style inline expanders for scope, axis, Optional and adapter. Submit the site to the hub. |
| [Bartosz Ciechanowski](https://ciechanow.ski/archives/) | Dozens of one-concept figures per essay; latest ["Moon"](https://ciechanow.ski/moon/) (Dec 2024) | A long-form "Life of a Chain" essay: each figure adds one step kind, and a fixed colour legend holds throughout (focus is one colour, none is red). |
| Red Blob Games ([making-of](https://www.redblobgames.com/making-of/line-drawing/), [talk notes](https://www.redblobgames.com/x/2306-educ432/)) | SVG + d3-drag + a `Diagram` class with layered `onUpdate` closures; "let the reader change the inputs… show the outputs"; alternates explorables and explanations | His architecture nearly verbatim: each figure is a `Diagram` fed by `evaluate(program, collection) → trace`; draggable domain objects; layers for grid, focus, argument arrows and Optional badge. |
| Josh Comeau ([how I built my blog](https://www.joshwcomeau.com/blog/how-i-built-my-blog-v2/), [flexbox guide](https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/)) | MDX plus a reusable `<Demo>` shell; strong metaphors | One `<ChainDemo>` shell with step, reset, key picker and scope toggle. Print the live chain beside the visual and bold the changed segment. One metaphor per axis (focus is a spotlight, `other()` hands it off, traverse is a sweep, peers is a chorus). |
| Scrollytelling: [The Pudding guide](https://pudding.cool/process/how-to-implement-scrollytelling/), [Scrollama](https://github.com/russellsamora/scrollama) 3.2.0 (2022 release), [Distill](https://distill.pub/2021/distill-hiatus/) (on hiatus) | Sticky graphic plus `onStepProgress` | An "Anatomy of `vectorMapChain({A,B})…value("A")`" landing page: each scroll step is one IR step, and progress scrubs the transition. |

**Step-execution visualizers**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| [Python Tutor](https://pythontutor.com/) | Records the run and steps forward and back, drawing frames, objects and pointer arrows; now with an AI tutor ([UCSD](https://today.ucsd.edu/story/a-uc-san-diego-tool-teaching-code-to-25-million-is-even-more-critical-in-age-of-ai)) | Record once and scrub freely, since evaluation is deterministic. Show locals as a "frame" with arrows to the objects read. |
| J's [Dissect](https://code.jsoftware.com/wiki/Vocabulary/Dissect) | 2D picture of a sentence's execution with intermediate results and localized errors | A Dissect grid: rows are keys, columns are steps, cells are Optionals, and the first `none` gets a red outline with its reason. |
| Excel [Trace Precedents/Dependents](https://support.microsoft.com/en-us/office/display-the-relationships-between-formulas-and-cells-a59bef2b-3701-46bf-8ff1-d3518771d507) and [Evaluate Formula](https://support.microsoft.com/en-us/office/evaluate-a-nested-formula-one-step-at-a-time-59a201ae-d1dc-4b15-8586-a70aa409b8a7) | Blue and red tracer arrows; F2 colour-coded refs; Step In/Out. Google Sheets has no native equivalent. | The closest mental model to Vex, since relative and absolute refs map to self, other and key: a "Spreadsheet Lens" (C.5 #9). |
| [Lean 4 InfoView](https://github.com/leanprover/vscode-lean4) ([live](https://live.lean-lang.org/)) | Goal state at the cursor | A cursor InfoView: the caret's position in the chain shows scope, focus, locals, the Optional and the legal next calls. |
| [Quokka.js](https://quokkajs.com/) | Inline live values, Time Machine | `//?` after any chain segment pins its runtime Optional inline: the runtime twin of twoslash `^?`. |
| Kit Langton's [Visual Effect](https://effect.kitlangton.com/) ([repo](https://github.com/kitlangton/visual-effect), MIT, pushed 2026-07) | One animated card per Effect combinator, short-circuit animations, sound cues | A "Visual Vex" gallery: one micro-animation per step kind and axis, with short-circuit-to-none animations. |
| [Effect Playground](https://effect.website/play) ([post](https://effect.website/blog/releases/playground)) | Monaco plus WebContainer plus a span trace tree and waterfall that highlights errors | Render Vex traces as spans and highlight the ones that produced `none`. |
| [regex101](https://regex101.com/) | Auto-generated English explanation, unit tests, debugger | Auto-narrate the IR in English ("Select `position` on the focused object → invoke `add`…"); a per-key assertion panel. |
| [Uiua pad](https://www.uiua.org/pad) | Runnable pads embedded in docs that print the stack | Every doc example is a pad that prints the post-step focus and Optional. |

**Live coding**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| [Strudel](https://strudel.cc/) ([visual feedback](https://strudel.cc/learn/visual-feedback/); moved to [Codeberg](https://codeberg.org/uzu/strudel)) / [TidalCycles](https://tidalcycles.org/) | "Active parts of mini notation… are highlighted as they play"; inline widgets such as `_punchcard` | Token-level sync: the executing chain segment glows. Inline `_grid()`/`_rail()` widgets render under a line. |
| [Hydra](https://hydra.ojack.xyz/) ([repo](https://github.com/hydra-synth/hydra)) | Fluent chains → live visuals; the README grows the chain one call at a time | **The best onboarding match.** Each tutorial step appends exactly one call, and the canvas updates instantly. |
| [Hazel](https://hazel.org/) | Live functional programming with typed holes: "no meaningless editor states" | Totality as UX: every prefix of a chain is a valid program, and an unfinished tail shows as a typed hole. |
| [Observable Framework](https://github.com/observablehq/framework) / [Notebook Kit](https://github.com/observablehq/notebook-kit), [marimo](https://docs.marimo.io/), [Livebook](https://livebook.dev/) | Reactive cells. Framework activity is slowing (1.13.4, 2026-03); Notebook Kit 2.6.6 is active. | Page-level reactivity: one editable collection drives every chain on the page. A Livebook-style "smart chain builder" form emits fluent code, and the code stays the source of truth. |
| [Shadertoy](https://www.shadertoy.com/) | Live GLSL with time and mouse uniforms; gallery | `time` and `mouse` as inputs so chains over moving vectors animate; a remixable gallery. |

**Playgrounds and language tours**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| [TS Playground](https://www.typescriptlang.org/play) and its [plugins](https://www.typescriptlang.org/dev/playground-plugins/) | `// ^?` inline types; sidebar plugin system | Cheapest prototype: a Playground plugin that shows the IR and trace of the current file. |
| [ArkType playground](https://arktype.io/playground) ([source](https://github.com/arktypeio/arktype/tree/main/ark/docs/components/playground)) | Monaco, TS worker, custom hovers and an "error lens"; Parse and Traverse result panes; the same component embedded in docs | Copy the architecture almost 1:1: one `<Playground>` serving both the full page and inline blocks, with IR and Evaluation panes. |
| [Kysely playground](https://play.kysely.dev/) ([repo](https://github.com/kysely-org/kysely-playground)) | Panes for schema types, query and SQL output; URL state; embed params; version and branch picker | Panes for domain/adapter, chain, and IR plus result. A version picker can show semantics drift between releases. |
| [Svelte tutorial](https://svelte.dev/tutorial) ([repo](https://github.com/sveltejs/svelte.dev)) | Lesson, editor and preview, a "solve" button, pluggable runtimes (Rollup or WebContainer) | "Solve" buttons; a light runtime for 95% of lessons. |
| [Gleam tour](https://tour.gleam.run/) ([everything page](https://tour.gleam.run/everything/)), [Tour of Go](https://go.dev/tour/), [Rust by Example](https://doc.rust-lang.org/rust-by-example/), [Elm guide](https://guide.elm-lang.org/) | Tiny runnable lessons plus a one-page printable view | "A Tour of Vex" (about 20 lessons) plus "Vex by Example" organised by scope and axis. |
| [zod-playground](https://zod-playground.vercel.app/) (community) | Version switching | Version switching. |

**Data-query DSL tools**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| [JSONata Exerciser](https://try.jsonata.org/) | Data on the left, expression top right, result below | **Build this first:** collection JSON, chain, Optional result. |
| [jq play](https://play.jqlang.org/) ([repo](https://github.com/jqlang/playground)) | Official, active; interpreter options as toggles | Toggles for strict versus lenient mode. |
| [Vega editor](https://vega.github.io/editor/) ([repo](https://github.com/vega/editor)) | Spec as data beside the output, plus data, signal and dataflow viewers | IR JSON plays the compiled spec; a locals timeline plays the signal viewer; an IR dataflow graph plays the dataflow viewer. |
| [Hoogle](https://hoogle.haskell.org/) | Search by type signature | "Vexle": search ops by `Vec2 -> Vec2 -> Vec2` or by algebraic property. |
| [Regexper](https://regexper.com/), [Regulex](https://jex.im/regulex/) | Railroad diagrams of a mini-language. Debuggex returned HTTP 502 and is likely discontinued. | Railroad diagrams of the chain grammar, with your current position highlighted. |
| [LINQPad](https://www.intertech.com/an-introduction-to-expressions-and-the-tree-view-in-linqpad7/) | Fluent query chains with a `.Dump()` at any step plus result, lambda, SQL and tree tabs. IQueryable expression trees are "program as data". | A `.tap()`/`dump` step in docs, and a results pane with Result, Trace, IR, Types and Test tabs. |

**Games as tutorials**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| [CSS Diner](https://flukeout.github.io/) | Type a selector and matching items on the table wiggle | "Vex Diner": prompts like "focus the *other* vector's position" against a scene. |
| [Learn Git Branching](https://learngitbranching.js.org/) ([repo](https://github.com/pcottle/learnGitBranching), 34k stars, active) | Commands animate a graph; levels, sandbox, undo, "golf" and a level builder | Levels defined as (collection, goal, par steps), with undo and levels shareable by URL. |
| [Flexbox Froggy](https://flexboxfroggy.com/), [SQL Murder Mystery](https://mystery.knightlab.com/) | Narrative levels over a dataset | A "which particle collided?" mystery over a vector collection. |

**Program-as-data views and diagrams**

| Example | What it is / status | Steal for Vex |
|---|---|---|
| [AST Explorer](https://astexplorer.net/), [Compiler Explorer](https://godbolt.org/) | Hover-linked source ↔ tree/output; colour-matched lines | Three-way linking between source span, IR node and grid objects, with one colour per step. |
| [Stately](https://stately.ai/docs/simulate-mode) and [Stately Sketch](https://prod.stately.ai/blog/2026-03-26-introducing-stately-sketch) (MIT, 2026-03) | Possible next events highlighted; event log with jump-back | "Legal next call" chips derived from the type state, with a history log. |
| [Glamorous Toolkit](https://gtoolkit.com/) | Moldable per-object views | `adapter.view()`, so the docs render any domain: arrows for vectors, swatches for colours, a grid for matrices. |
| [Potluck](https://www.inkandswitch.com/potluck/) (Ink & Switch) | Searches that annotate text inline | Evaluate chains against a JSON or prose listing and highlight the matched objects inline. |
| [RxMarbles](https://rxmarbles.com/) (archived, "fine as it is"), [RxViz](https://rxviz.com/), [Swirly](https://swirly.dev/) | Draggable marble diagrams; diagrams generated from text | "Optional rail" marble lanes generated from IR, so they never go stale. |
| Scott Wlaschin's [Railway Oriented Programming](https://fsharpforfunandprofit.com/rop/) | Success and failure tracks for error handling | The canonical metaphor for Optional-first evaluation. |
| [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT) vs [tldraw](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) | tldraw needs a licence key for production use. | Export hand-drawn SVGs from Excalidraw at build time; avoid tldraw. |

## C.2 Top 10 patterns to steal

1. **Cursor InfoView** (Lean): the caret position shows the full evaluation state.
2. **A recorded trace with a reversible, scrubbable timeline** (Python Tutor, Victor's dots, Quokka).
3. **Three-way linked highlighting with stable colours** across source, IR and grid (AST Explorer, Compiler Explorer, Strudel).
4. **"Why none?"**: a Dissect grid, Excel-style red tracer arrows and Effect-style error spans.
5. **Grow-the-chain onboarding** (Hydra, Gleam, Svelte "solve").
6. **The spreadsheet metaphor** with precedent arrows and Evaluate Chain (Excel). This would be novel, since Google Sheets lacks it.
7. **Puzzle levels, sandbox and level builder** (CSS Diner, Learn Git Branching).
8. **One embeddable playground component** (ArkType, Kysely, TS Playground) with URL state, `^?` types, `//?` values and a version picker.
9. **Ladder of abstraction and reactive prose** (Victor, Tangle, Observable).
10. **A micro-animation gallery generated from IR** (Visual Effect, RxMarbles, Swirly).

## C.3 Tech stack recommendation

**Constraints that drive the choices:**
- Docs tooling needs the TS 6 JS API, as in the matrix in §A.2.
- GitHub Pages cannot set COOP/COEP headers. [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) (last pushed 2023) is the only workaround, and it forces a reload on first visit.
- Without those headers, self-hosted WebContainers ([headers guide](https://webcontainers.io/guides/configuring-headers)) and oxc's browser wasm (which uses shared memory) are both off the table.

| Layer | Choice | Version | Why | Alternative |
|---|---|---|---|---|
| Site | **Astro + Starlight** | 7.3.8 / 0.42.5 | One island per widget, zero-JS prose, Pagefind, any UI framework; effect.website runs this exact stack ([repo](https://github.com/Effect-TS/website)) | Fumadocs 16.16.2 if TS 7-native twoslash and type tables matter more ([docs](https://fumadocs.dev/docs)) |
| TS policy | Docs package on `typescript@6.0.3` via the `ts6` catalog; libraries on 7.0.2 | 6.0.3 / 7.0.2 | twoslash, vfs, TypeDoc and astro check need the JS API | `@typescript/typescript6` alias, which has the vfs lib-path bug #3645 |
| Islands | React via `@astrojs/react`; nanostores for shared state | 19.3 / 7.0.1; nanostores 1.5.5 | xyflow, Motion and editor wrappers | Svelte 5 + Svelte Flow 1.7 |
| Code blocks | Expressive Code (bundled with Starlight) plus a custom "Open in Lab" plugin | 0.44.2 (Shiki 4) | Frames, markers and diffs; Effect's `pluginOpenInPlayground` pattern | — |
| Static type hovers | A custom `<Twoslash>` Astro component: `shiki` `codeToHtml` + `@shikijs/twoslash` `rendererRich`, rendered at build time with CSS-only popups | shiki 4.5.0, twoslash 0.3.9 | expressive-code-twoslash 0.6.1 is out of range for EC 0.44 and TS 6 ([repo](https://github.com/withstudiocms/expressive-code-twoslash)) | fumadocs-twoslash 4 (TS 7-native) |
| Editor | **CodeMirror 6** + a TS 6 language service in a module worker (`@typescript/vfs`), with the `@valtown/codemirror-ts` glue vendored because that repo is archived | @codemirror/view 6.43.14, vfs 1.6.5 | Mobile and accessible; Monaco's FAQ answers "No" to mobile ([README](https://github.com/microsoft/monaco-editor#faq)) | Monaco 0.57.0 for a desktop-only `/lab` (TS worker ~6.6–6.9 MB raw) |
| Live type queries | twoslash-cdn in the same worker | 0.3.9 | Live `^?` per chain step ([docs](https://twoslash.netlify.app/packages/cdn)) | Language-service quickinfo |
| Transpile user code | **ts-blank-space**, reusing the worker's AST | 0.9.0 | Tiny, and it keeps exact source positions, so trace spans map 1:1 onto editor ranges ([repo](https://github.com/bloomberg/ts-blank-space)) | sucrase 3.35.1; TS `transpileModule` as fallback; esbuild-wasm is 3.7 MB gzip |
| Execution sandbox | A module Worker with the Vex runtime bundled, a `worker.terminate()` timeout, and Comlink or `postMessage` streaming traces | Comlink 4.4.2 | Isolation plus protection against infinite loops; a timeout becomes a visible abort frame | `sandbox="allow-scripts"` iframe if examples need the DOM |
| Full project | StackBlitz SDK `openProject` (runs on stackblitz.com's origin) | 1.11.1 | "Open as Vitest project" without needing COOP/COEP | Sandpack is dormant (last release 2025-02) |
| Animation | **Motion** | 14.0.0 (MIT) | API stable since v12; 13 and 14 changed only internals ([CHANGELOG](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md)) | GSAP 3.15: best timeline scrubbing, free but under a custom non-OSI licence ([license](https://gsap.com/standard-license)) |
| IR graph | `@xyflow/react` + `elkjs` (layout in a worker) | 12.12.0 / 0.12.0 | Interactive DAG with a layered layout | Mermaid 12.1 for static diagrams (ELK is now its default layout) |
| Charts and hand-drawn look | Observable Plot + d3 modules; Rough.js | 0.6.17 / 7.9.0; 4.6.6 | Benchmarks, fuzz histograms, sketch style | — |
| Grammar diagrams | Vendored tabatkins `railroad.js` from one `vex.ebnf`, rendered at build time | repo HEAD (MIT; npm package is from 2015) | Each NonTerminal box links to the API page and the Lab ([repo](https://github.com/tabatkins/railroad-diagrams)) | Gunther Rademacher's [RR](https://github.com/GuntherRademacher/rr); [ebnf2railroad](https://github.com/matthijsgroen/ebnf2railroad) |
| API reference | starlight-typedoc + typedoc + typedoc-plugin-markdown (TS 6) | 0.23.1 / 0.28.20 / 4.13.1 | Native Starlight sidebar ([getting started](https://starlight-typedoc.vercel.app/getting-started/)) | — |
| Plugins | links-validator, llms-txt, sidebar-topics, image-zoom; blog and versions later | 0.26.0 / 0.12.0 / 0.9.0 / 0.16.1 | Link checks, LLM export, Learn/Lab/Spec/Reference topics | — |
| Share URLs | `CompressionStream("deflate-raw")` + base64url in the `#` fragment, with a version prefix | Baseline widely available | No dependency, and the fragment never reaches the server ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)) | lz-string 1.5.0, which TS Playground links use |
| Motion APIs | Same-document View Transitions are Baseline since 2025-10-14 (Firefox 144). Scroll-driven animations are **not** Baseline (missing in Firefox) ([web-features](https://github.com/web-platform-dx/web-features)). | — | Use IntersectionObserver plus Motion `scroll()` for scrollytelling | GSAP ScrollTrigger |
| Site tests | `@playwright/test` with `toHaveScreenshot`, `toMatchAriaSnapshot` and `@axe-core/playwright`; lychee-action weekly for external links | 1.64.0, 4.13.0 | Visual, ARIA and accessibility checks ([release notes](https://playwright.dev/docs/release-notes)) | — |
| Prose | `ste-lint` (ASD-STE100), as in your portfolio repo | — | Consistency across your sites | — |

Astro and Starlight changes that matter here:
- **Astro 7:**
  - Rust compiler, which treats unclosed tags as errors.
  - Sätteri is the default Markdown/MDX processor, so remark/rehype plugins need `markdown: { processor: unified() }`.
  - Vite 8.
  - `compressHTML: 'jsx'` can remove whitespace between inline elements.
  - Sources: [Astro 7](https://astro.build/blog/astro-7/), [upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v7/). Keep the doc-test extractor (§B.3) outside the Astro pipeline.
- **Starlight 0.42:**
  - Requires astro ≥7.2.10.
  - The mobile menu uses `popover`.
  - Drops Chromium <116, Safari <17 and Firefox <125.
  - Source: [CHANGELOG](https://github.com/withastro/starlight/blob/main/packages/starlight/CHANGELOG.md).
- **Base path:** `site: 'https://mark1russell7.github.io'`, `base: '/Vex'`. The path is case-sensitive.

## C.4 Site architecture *(proposal)*

```
vex/                                pnpm 12 workspace (scaffold via lib new + new cue features)
├─ packages/vex/                    @mark1russell7/vex — Optional, IR, eval (+ explain()), scopes, chain, traversal
├─ packages/testkit/                @mark1russell7/vex-testkit — fast-check arbitraries (programs, scopes,
│                                   adversarial adapters) + law checkers + conformance harness.
│                                   Used by CI, by adapter authors, AND by the docs Fuzz Arena.
├─ spec/                            *.case.ts conformance cases · vex.ebnf · reason-code registry (VEX-E00x)
├─ apps/site/                       @vex/site (private) — Astro 7 + Starlight 0.42, typescript 6.0.3
│   ├─ src/islands/                 ChainDemo, FocusTheater, Timeline, InfoView, IRLens, Rail, Lab …
│   └─ src/worker/                  vex runtime + ts-blank-space + TS6 LS (vfs) + trace streaming
├─ tools/doctest/                   md/mdx → .doctest/*.test.ts
├─ tools/mutation/                  Stryker lane (vitest4 catalog) until #6210 ships
└─ tests/ts-compat/                 consumer fixture × TS 5.9/6.0/7.0/next
```

**Information architecture** (with starlight-sidebar-topics):
- **Learn:** Tour, Concepts, Visual Vex.
- **Lab:** Playground, Vexplay, Vex Diner, Adapter Workshop, Fuzz Arena.
- **Spec:** Living Spec, Conformance Matrix, Failure Index.
- **Reference:** TypeDoc API, Grammar/railroad, Vexle op search, Benchmarks.

**Single-source rule:** spec cases, golden traces and docs examples are the *same files*. The site imports `spec/cases/**` and the CI conformance JSON, so the docs cannot drift from the tests.

## C.5 Brainstormed ideas for Vex, ranked by impact and effort

Impact is scored 1–5. Effort: S ≈ 1–2 days, M ≈ 1 week, L ≈ 2–4 weeks. "Depends on" refers to the Roadmap phases in `docs/ROADMAP.md`.

| # | Idea | What the reader experiences | Steals from | Impact | Effort | Depends on | Feasibility notes |
|---|---|---|---|---|---|---|---|
| 1 | **Trace engine + `<ChainDemo>` shell** | Every example on the site gets Run/Step/Reset, a key picker, a scope toggle (map, array, matrix) and per-step some/none badges | Red Blob `Diagram`, Comeau `<Demo>` | 5 | M | P2.4 + P3.4 `explain()` | Foundation for #2–#24. The trace JSON doubles as golden test output (§B.0). |
| 2 | **Visual Vex gallery + Optional Rail** | One micro-animation per step kind and axis (Select, Switch, Invoke, local, other, peers, traverse, reduceBy, scalar lift inflating `5` → `Vector(5,5)`); a railway with some and none tracks, signposts that carry reason codes, and a strict-vs-lenient toggle | Visual Effect, RxMarbles, Wlaschin ROP | 4 | S each | None (scripted first, trace-driven later) | Can ship **before** the trace exists. Motion 14 + SVG; optional sound cue on `none`. |
| 3 | **Living Spec + Conformance Matrix** | The README spec, where every MUST clause and normative example is a runnable card with a pass/fail/known-failure chip from CI JSON; clicking shows the case file and its golden trace | test262 reports, CommonMark, oxc coverage snapshots | 5 | M | Conformance suite (§B.2) | Honest about drift (peers and fork unimplemented). Turns the spec into a trust signal. |
| 4 | **Focus Theater** | A stage of object cards laid out as map, array or matrix. A spotlight moves on Switch, Select highlights the property chip, Invoke draws arrows from PropRef/OfRef sources into the op, and `none` shows as a red ✕ with its reason | Learn Git Branching, Python Tutor arrows, Excel tracers | 5 | M–L | Trace (`reads`, `focusBefore/After`) | Motion layout animations. The matrix scope renders as a CSS grid. |
| 5 | **Step debugger: timeline + cursor InfoView + active-token glow** | Scrub a dot timeline (Victor) or move the caret (Lean). The panel shows focus, locals, the Optional and legal next calls, and the executing call glows in the editor (Strudel). | Victor, Lean, Strudel, Quokka | 5 | M | Trace + source spans | ts-blank-space keeps positions; record spans per IR step from the TS AST. CodeMirror decorations. |
| 6 | **"Why none?" Failure Museum** | Each reason code (VEX-E001 missing-prop … E007 upstream-none) has a page with an animated minimal repro and the fix; playground `none`s link to it | Rust error index, Elm errors, J Dissect | 5 | S–M | Reason codes (P3.4) | Also a doc-test target: every museum repro is a conformance case. |
| 7 | **Twoslash hovers everywhere + build gate** | Hover any static snippet to see `Optional<Vector>` at each step; the docs build fails on unexpected type errors | TS Playground `^?` | 4 | S | Typed surface (P3.2) | Custom `<Twoslash>` on TS 6 (C.3). Doubles as type-level doc-tests. |
| 8 | **A Tour of Vex** | About 20 lessons that each append exactly one call, with "solve", an everything-on-one-page view, and "Vex by Example" recipes | Hydra, Gleam/Go tours, Svelte | 4 | M | #1 | Lessons are MDX plus `spec=` fences, so they are doc-tested (§B.3). |
| 9 | **Spreadsheet Lens** | Rows are keys and columns are props. The chain's refs are colour-coded (F2 style) and precedent arrows draw on the grid. Traverse fills a result column down; peers is a key × key matrix. An "Evaluate Chain" dialog has Step In. | Excel formula auditing | 5 | M | Trace `reads` | Novel, since Google Sheets has no native tracers. Explains relative vs absolute refs (self, other, key). |
| 10 | **Axes Explorer** | Drag boxes (position and size) on a canvas, toggle self/other/peers/traverse highlights, and watch the §18.1 separation test's `any()` flip as boxes overlap. Ladder rungs: one key, small multiples per key, parameter-sweep plot. Includes scrubbable numbers in the surrounding prose. | Ciechanowski, Victor, Tangle | 5 | M | `peers` (P3.1); focus as value (P2.2) | Pure client-side. Plot for the sweep chart. |
| 11 | **Vexplay (bring your own data)** | Paste JSON (map, array or matrix); numeric fields lift through the NDVector adapter; write chains; get a live result and a share URL | JSONata Exerciser, jqplay | 4 | S–M | Worker runtime | CompressionStream URLs. Strict/lenient toggle like jq's options. |
| 12 | **Lab playground** | CodeMirror with TS 6 hovers, completion and an error lens; panes for result, trace, IR, types and test; a "Turn into test" button exports a conformance case or golden snapshot; "Open in StackBlitz" | ArkType, Kysely, TS Playground, LINQPad tabs | 4 | M–L | P3.2 | The TS worker is about 1.1 MB brotli. Lazy-load it on first focus. |
| 13 | **IR Lens** | Fluent code, IR JSON and a dataflow graph side by side, with one colour per step. Editing the IR re-prints the fluent code (program as data). | AST Explorer, Compiler Explorer, Vega dataflow | 4 | M–L | IR → fluent printer (new) | xyflow + ELK in a worker. The printer is about 150 lines once the IR is honest (P2.4). |
| 14 | **Reducer marbles** | Draggable some/none marbles from `traverse`, fed into any/all/none/sum/min/max/fold/reduceBy, with a strict-vs-lenient switch | RxMarbles | 4 | S | Traversal API | Generated from real `Traversal` results. |
| 15 | **Fuzz Arena** | Run the CI properties live in the browser. A counterexample appears and **the shrinker replays** step by step (`RunDetails.failures` with `verbose: 1`). A "bug hunt" rediscovers V-016 (`Color.add` is not commutative). | fast-check | 4 | M | testkit package | fast-check is isomorphic. Time-box each run with the 4.10 plugin. |
| 16 | **Adapter Workshop** | Define `Money`, `Complex` or `Color` in the editor and declare op metadata. You instantly get a typed DSL (hovers and completion), the Fuzz Arena checks the metadata claims, and `view()` renders values. | Glamorous Toolkit, TS LS | 5 | L | P2.1 op registry, P3.2, #15 | Shows the "domain-agnostic" claim viscerally. The flagship once the core is ready. |
| 17 | **Vex Diner** | Puzzle levels ("sum every peer's size") on a scene, with par steps (golf), undo, and a level builder that exports URL levels | CSS Diner, Learn Git Branching | 4 | M | #4 | High engagement and shareability. |
| 18 | **Legal-next chips + live railroad** | Chips list the valid next methods for the current type state. The railroad diagram of `vex.ebnf` highlights where your chain is. | Stately simulate, Regexper | 3 | S–M | P3.2 (types), ebnf | Generate the chips from the builder types via the language service's completions. |
| 19 | **Locals and optics register file** | Named locals as a CPU-style register panel; optic paths (`focus.pos.x`, `peer.pos.x`) highlighted on an object tree; `applyUsing` wires registers into method parameters | Python Tutor frames | 4 | M | P2.3 single locals model | Explains the implementation's most novel part, which the spec never mentions. |
| 20 | **Monoid Fold Lab** | A fold tree re-parenthesizes (associativity) and reorders (commutativity) with animation; a "lie about metadata" toggle shows the results diverging | Victor ladder | 3 | S–M | Op metadata | Teaches §14 and why `reduceBy` relies on the metadata being honest. |
| 21 | **Scrollytelling landing: "Anatomy of a Chain"** | A sticky stage where each scroll step is one IR step of §18.1 and scroll progress scrubs the transitions | The Pudding, Scrollama, Distill | 4 | M | #1 (or scripted) | IntersectionObserver + Motion; scroll-driven CSS only as progressive enhancement. |
| 22 | **Trace Diff + version picker** | Compare traces between start keys, between two chains, or between two Vex versions; the first divergent step is highlighted | Compiler Explorer diff, Kysely/zod-playground versions | 3 | S–M | Trace + versioned builds | Good for changelogs ("semantics changed in 0.3"). |
| 23 | **Vexle op search** | Search ops by signature (`Vec2 -> number`), by property (commutative), or by result kind; results open in the Lab | Hoogle | 3 | S–M | P2.1 registry | The index is built from the op registry at build time. |
| 24 | **Type-state explorer** | A statechart of the typed builder (NeedsSelect → Domain → Terminal Scalar/Boolean). Each edge links to its positive type test, and each missing edge to its negative test. | Stately, XState | 3 | M | P3.2 + type tests | A visual index of the type-test suite. |

Wildcards, folded into the ideas above: Hazel-style typed holes for unfinished chains (Lab), sound cues (Visual Vex), and an in-browser tinybench race of chain versus hand-written code (Benchmarks page).

## C.6 Build order mapped to the Roadmap *(proposal)*

1. **Alongside Roadmap P0–P1** (no runtime dependency):
   - Starlight skeleton and Pages deploy (`/Vex/`).
   - Visual Vex gallery and Optional Rail (#2), scripted.
   - Living Spec with a static matrix fed from CI JSON (#3).
   - Railroad diagrams from `vex.ebnf`.
   - The site lints prose with ste-lint.
2. **After P2.4 + P3.4 (trace):**
   - ChainDemo (#1), Focus Theater (#4), step debugger (#5), Failure Museum (#6).
   - Make the Living Spec runnable.
   - Spreadsheet Lens (#9), Tour (#8), Vexplay (#11), reducer marbles (#14).
3. **After P3.1/P3.2 (peers and typed surface):**
   - Axes Explorer (#10), twoslash (#7), Lab (#12), legal-next chips (#18), type-state explorer (#24), Vex Diner (#17), locals register file (#19, after P2.3).
4. **After P2.1 + testkit:** Fuzz Arena (#15), Monoid Lab (#20), Vexle (#23), then Adapter Workshop (#16).
5. **Polish:** IR Lens round trip (#13), Trace Diff (#22), scrollytelling landing (#21).

## C.7 Uncertain (Part C)

- **TS 7.1 for docs tooling.** If 7.1 ships its API and wasm build, twoslash, vfs and TypeDoc may move off TS 6 in Q4 2026 to Q1 2027. That isn't guaranteed: twoslash#93 shows no work started, and the wasm PR [typescript-go#4733](https://github.com/microsoft/typescript-go/pull/4733) was closed without merging.
- **expressive-code-twoslash with EC 0.44** might work with peer overrides; untested.
- **Fumadocs on Astro**, and Fumadocs' static export with `basePath` on Pages, are unverified.
- **StackBlitz embeds** on non-Chromium browsers from a page without cross-origin isolation are unconfirmed. WebContainer licensing for OSS docs needs confirmation; only for-profit production use is documented as needing a licence.
- **coi-serviceworker side effects** on third-party embeds are inferred, not tested.
- **Bundle sizes** are raw-file and gzip measurements of individual packages, not end-to-end bundles.
- **Starlight with ClientRouter / `transition:persist`** is supported by the community only.
- **Exemplar details from secondhand sources:** Observable Framework's future (activity is slowing, no deprecation notice), Debuggex's status (HTTP 502), Python Tutor's open-source status (original repo 404), regex101 and Compiler Explorer feature details, and Amelia Wattenberger's colour-linking technique.
- **tldraw licensing pages** are inconsistent, but the repo LICENSE.md confirms the production restriction.
- **Gleam tour's in-browser compilation** is inferred from its README. Uiua pad returns 404 to bots because it is a GitHub Pages SPA.
- **The C.5 ideas** are my designs. Impact and effort scores are judgment calls tied to the Roadmap phases, not measurements.
