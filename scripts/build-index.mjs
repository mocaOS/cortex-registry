#!/usr/bin/env node
/**
 * Aggregate apps/{slug}/listing.json → index.json at the repo root.
 *
 * index.json is the registry's consumable catalog: Cortex instances fetch it
 * (raw.githubusercontent.com) for the admin "Browse Registry" panel, and the
 * browse site renders from it. Deterministic output (sorted, no timestamps)
 * so CI can verify the committed file matches the listings:
 *
 *   node scripts/build-index.mjs           # write index.json
 *   node scripts/build-index.mjs --check   # fail if committed file is stale
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const appsDir = join(root, "apps");
const slugs = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const index = {
  $schema: "https://raw.githubusercontent.com/mocaOS/cortex-registry/main/schema/listing.v1.json",
  version: 1,
  apps: slugs.map((slug) => ({
    slug,
    ...JSON.parse(readFileSync(join(appsDir, slug, "listing.json"), "utf8")),
  })),
};

const output = JSON.stringify(index, null, 2) + "\n";
const target = join(root, "index.json");

if (check) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== output) {
    console.error("index.json is stale — run: node scripts/build-index.mjs");
    process.exit(1);
  }
  console.log(`✓ index.json up to date (${slugs.length} app(s))`);
} else {
  writeFileSync(target, output);
  console.log(`✓ index.json written (${slugs.length} app(s))`);
}
