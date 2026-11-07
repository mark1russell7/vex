/**
 * The sha256 of the print of each module of ireko (COMPILE.MODULE.BYTES.HASH). The file `ireko-prints.json` keeps these
 * hashes. A reader compares the hash of a committed file with the hash of its print, with no run of vex.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { IREKO_MODULES, irekoSource, type IrekoModule } from "./ireko-modules.ts";

/** The committed file of the hashes. */
export const PRINTS_FILE: URL = new URL("ireko-prints.json", import.meta.url);

/** The command that writes the file of the hashes again. */
export const PRINTS_WRITE = "node packages/pilots/scripts/ireko-prints.ts --write";

/** The content of the file: the sha256 in hex of the print of each module. */
export interface IrekoPrints {
  readonly prints: Readonly<Record<string, string>>;
}

/** This function gives the sha256 in hex of the UTF-8 bytes of a text. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** This function gives the hash of the build print of each module, with the keys in sorted order. */
export function currentPrints(): IrekoPrints {
  const names = [...IREKO_MODULES].toSorted();
  return { prints: Object.fromEntries(names.map((which: IrekoModule) => [which, sha256(irekoSource(which, "value"))])) };
}

/** This function gives the text of the file: JSON with an indent of 2 spaces and a final newline. */
export function printsText(prints: IrekoPrints): string {
  return `${JSON.stringify(prints, undefined, 2)}\n`;
}

/** This function reads the committed file of the hashes. */
export function readPrints(file: URL = PRINTS_FILE): string {
  return readFileSync(file, "utf8");
}

/** This function gives the hashes of a committed text, or no hashes for a text that is not JSON. */
function keptPrints(committed: string): Readonly<Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(committed);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || !("prints" in parsed)) return {};
  const { prints } = parsed;
  if (typeof prints !== "object" || prints === null) return {};
  return Object.fromEntries(Object.entries(prints).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/**
 * This function compares the committed text with the current hashes. It gives nothing for equal text, and otherwise a
 * message that names each module that differs and the command that writes the file again.
 */
export function printsDrift(committed: string, current: IrekoPrints): string | undefined {
  if (committed === printsText(current)) return undefined;
  const kept = keptPrints(committed);
  const names = [...new Set([...Object.keys(current.prints), ...Object.keys(kept)])].toSorted();
  const differ = names.filter((name) => kept[name] !== current.prints[name]);
  return [
    differ.length > 0 ? `ireko-prints.json differs from the prints of these modules: ${differ.join(", ")}.` : "ireko-prints.json has the hashes of the prints, but not the text of the file.",
    "A change of the compiler that changes a print changes its hash. Write the file again:",
    `  ${PRINTS_WRITE}`,
  ].join("\n");
}
