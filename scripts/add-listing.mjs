#!/usr/bin/env node
/**
 * Generate a listing from a published release artifact — the publish flow
 * collapses to one command plus a PR:
 *
 *   node scripts/add-listing.mjs <release-zip-url> [--repo <url>] [--tags a,b] [--date YYYY-MM-DD]
 *
 * Downloads the zip, computes sha256 + size, extracts the embedded app.json
 * (which becomes listing.app VERBATIM — the equality CI later re-proves),
 * writes apps/{id}/listing.json, and rebuilds index.json. `--repo` defaults
 * to the GitHub repo inferred from a github.com release URL.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readZipEntries } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

if (!url || !url.startsWith("https://")) {
  console.error("usage: node scripts/add-listing.mjs <https release zip url> [--repo url] [--tags a,b] [--date YYYY-MM-DD]");
  process.exit(1);
}

const inferredRepo = url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\//)?.[1];
const repo = flag("repo") ?? inferredRepo;
if (!repo) {
  console.error("cannot infer --repo from the URL — pass it explicitly");
  process.exit(1);
}

const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`artifact fetch failed: ${res.status}`);
  process.exit(1);
}
const buffer = Buffer.from(await res.arrayBuffer());
const sha256 = createHash("sha256").update(buffer).digest("hex");

const zip = readZipEntries(buffer, ["app.json"]);
if (!zip["app.json"]) {
  console.error("zip has no app.json at the root — is this an app package?");
  process.exit(1);
}
const app = JSON.parse(zip["app.json"].toString());
delete app.$schema;

const listing = {
  app,
  artifact: { url, sha256, size: buffer.length },
  repo,
  tags: (flag("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
  screenshots: [],
  listedAt: flag("date") ?? new Date().toISOString().slice(0, 10),
  status: "active",
};

const dir = join(root, "apps", app.id);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "listing.json"), JSON.stringify(listing, null, 2) + "\n");
console.log(`✓ apps/${app.id}/listing.json written (${app.name} v${app.version}, ${Math.round(buffer.length / 1024)} KB, sha256 ${sha256.slice(0, 12)}…)`);

execFileSync(process.execPath, [join(root, "scripts", "build-index.mjs")], { stdio: "inherit" });
console.log("\nnow: node scripts/validate-listings.mjs && open a PR");
