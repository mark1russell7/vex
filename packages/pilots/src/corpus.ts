/// <reference types="node" />
/**
 * The public corpus of programs (roadmap item CORPUSGATE). A corpus file is JSON in `packages/pilots/corpus`. It holds
 * programs with the input of the tool `vex_evaluate` of `@mark1russell7/vex-mcp`. The cases of a corpus evaluate each
 * program on the code path of that tool.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dataOf, domainsOf, programOf, spaceOf, type SpaceInput } from "@mark1russell7/vex-mcp";
import type { ShareCase } from "./fallback-share.ts";

/** One program of a corpus, with the input of the tool `vex_evaluate`. */
export interface CorpusProgram {
  /** The name of the program in the reports. */
  readonly name: string;
  /** One line that tells what the program does. */
  readonly why: string;
  /** The program: a Vex document as JSON, or its text. */
  readonly program: unknown;
  /** The space of the runs. Without a space, only the tier of the program counts. */
  readonly space?: SpaceInput;
  readonly vars?: Readonly<Record<string, unknown>>;
  /** The keys of the runs. The default is each key of the space. */
  readonly origins?: readonly string[];
  /** The names of the domains. The default is the domains of the tool. */
  readonly domains?: readonly string[];
}

/** A corpus file: the name of the source and its programs. */
export interface Corpus {
  readonly source: string;
  readonly programs: readonly CorpusProgram[];
  /** The programs that the corpus leaves out, by reason. The measurement does not read them. */
  readonly leftOut?: readonly { readonly reason: string; readonly count: number }[];
}

/** The folder of the corpus files. */
export const CORPUS_DIR: URL = new URL("../corpus/", import.meta.url);

/** This function reads each corpus file of the folder `dir`, in the order of the file names. A missing folder gives no corpus. */
export function readCorpora(dir: URL = CORPUS_DIR): Corpus[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).toSorted();
  } catch {
    return [];
  }
  return files.map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Corpus);
}

/** This function gives one case for each program of a corpus. Each case evaluates the program as the tool `vex_evaluate` does. */
export function corpusCases(corpus: Corpus): ShareCase[] {
  return corpus.programs.map((c) => ({
    name: c.name,
    run: (m) => {
      const domains = domainsOf(c.domains);
      const p = m.program(c.name, programOf(c.program, domains), { domains });
      if (c.space === undefined) return;
      const s = spaceOf(c.space, domains);
      const vars = c.vars === undefined ? {} : (dataOf(c.vars, domains) as Readonly<Record<string, unknown>>);
      for (const origin of c.origins ?? s.keys) p.run({ space: s, origin, vars });
    },
  }));
}
