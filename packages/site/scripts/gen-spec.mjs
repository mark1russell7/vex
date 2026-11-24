// This script makes the spec pages of the site from spec/README.md and spec/regressions.md. Each requirement ID
// becomes a <Req> chip that shows the status of its tests. The pages are generated, so git ignores them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..", "..");
const out = join(site, "src", "content", "docs", "spec");
mkdirSync(out, { recursive: true });

const GITHUB = "https://github.com/metrograph-labs/vex/blob/main";

function body(md) {
  return md
    .replace(/^# .*\n+/, "")
    .replaceAll("../docs/", `${GITHUB}/docs/`)
    // Escape the MDX characters inside code spans first, one line at a time, then add the chips.
    .replace(/`([^`\n]*[{}<>][^`\n]*)`/g, (m) => m.replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`))
    .replace(/\*\*\[([A-Z0-9.-]+)\]\*\*/g, '<Req id="$1" />')
    .replace(/^\| (V-\d{3}) \| test \|/gm, '| $1 | <Req id="$1" /> |');
}

const spec = readFileSync(join(repo, "spec", "README.md"), "utf8");
writeFileSync(
  join(out, "index.mdx"),
  `---\ntitle: The specification\ndescription: The Vex 1.0 specification, with the status of the tests of each requirement.\n---\n\nimport Req from "../../../components/Req.tsx";\n\n{/* This page is generated from spec/README.md by scripts/gen-spec.mjs. Do not edit it. */}\n\n${body(spec)}`,
);

const regressions = readFileSync(join(repo, "spec", "regressions.md"), "utf8");
writeFileSync(
  join(out, "regressions.mdx"),
  `---\ntitle: Regressions\ndescription: Each defect of the audits, with its test or the change that resolved it.\n---\n\nimport Req from "../../../components/Req.tsx";\n\n{/* This page is generated from spec/regressions.md by scripts/gen-spec.mjs. Do not edit it. */}\n\n${body(regressions)}`,
);
console.info("gen-spec: wrote the spec pages");
