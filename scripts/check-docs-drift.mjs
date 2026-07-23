#!/usr/bin/env node
/**
 * Docs-drift check — every active listing must be mentioned in the ecosystem's
 * three catalog docs, so the registry can't silently outgrow the documentation
 * (which is exactly what happened when the cloud-sync wave shipped: the apps
 * skill still listed 2 of 8 apps).
 *
 * Checked docs (fetched from each repo's main branch):
 *   cortex-app    handbook/24-apps.md                       "The app catalog"
 *   cortex-app    documentation/pages/features/apps.mdx     "First-party apps"
 *   cortex-skills public/apps/SKILL.md                      "First-Party Apps"
 *
 * A listing counts as documented when the doc contains its app name or slug
 * (case-insensitive). Yanked listings are exempt.
 *
 * Ordering note: when a PR adds a listing, merge the doc updates in the other
 * repos first (or alongside) — this check reads their main branches.
 *
 * Local runs against not-yet-pushed doc checkouts:
 *   CORTEX_APP_DIR=~/coding/cortex-app CORTEX_SKILLS_DIR=~/coding/cortex-skills \
 *     node scripts/check-docs-drift.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DOCS = [
  {
    envDir: "CORTEX_APP_DIR",
    repo: "mocaOS/cortex-app",
    path: "handbook/24-apps.md",
    hint: 'handbook ch. 24 "The app catalog"',
  },
  {
    envDir: "CORTEX_APP_DIR",
    repo: "mocaOS/cortex-app",
    path: "documentation/pages/features/apps.mdx",
    hint: 'docs page "First-party apps" table',
  },
  {
    envDir: "CORTEX_SKILLS_DIR",
    repo: "mocaOS/cortex-skills",
    path: "public/apps/SKILL.md",
    hint: 'apps skill "First-Party Apps" table',
  },
];

async function docText(doc) {
  const localRoot = process.env[doc.envDir];
  if (localRoot) {
    const p = join(localRoot.replace(/^~(?=\/)/, process.env.HOME ?? "~"), doc.path);
    if (!existsSync(p)) throw new Error(`local override ${doc.envDir} set but ${p} not found`);
    return { text: readFileSync(p, "utf8"), source: p };
  }
  const url = `https://raw.githubusercontent.com/${doc.repo}/main/${doc.path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`);
  return { text: await res.text(), source: url };
}

const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
const active = index.apps.filter((a) => a.status !== "yanked");
if (active.length === 0) {
  console.error("no active listings in index.json");
  process.exit(1);
}

const failures = [];
for (const doc of DOCS) {
  let text, source;
  try {
    ({ text, source } = await docText(doc));
  } catch (e) {
    failures.push(`${doc.repo}/${doc.path}: ${e.message}`);
    continue;
  }
  const haystack = text.toLowerCase();
  const missing = active.filter(
    (a) => !haystack.includes(a.app.name.toLowerCase()) && !haystack.includes(a.slug.toLowerCase()),
  );
  if (missing.length) {
    failures.push(
      `${doc.repo}/${doc.path} (${doc.hint}) is missing: ${missing.map((a) => `${a.app.name} [${a.slug}]`).join(", ")}`,
    );
  } else {
    console.log(`  ✓ ${source} — all ${active.length} active apps mentioned`);
  }
}

if (failures.length) {
  console.error("\nDocs drift detected — the catalog docs no longer cover every listed app:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    "\nFix: add the missing app(s) to the doc(s) above and merge those PRs, then re-run.\n" +
      "Local not-yet-pushed docs: set CORTEX_APP_DIR / CORTEX_SKILLS_DIR to your checkouts.",
  );
  process.exit(1);
}
console.log(`\n✓ ${active.length} active listing(s) covered by all ${DOCS.length} catalog docs`);
