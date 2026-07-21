#!/usr/bin/env node
/**
 * Registry validation — the CI floor every listing must pass.
 *
 * For each apps/{slug}/listing.json:
 *  - shape checks (listing.v1: app + artifact + repo + listedAt + status)
 *  - manifest sanity (mirrors the app template's validate.mjs core rules)
 *  - slug consistency: directory name == app.id
 *  - artifact integrity: DOWNLOADS the zip, verifies byte size and sha256,
 *    and checks the zip's embedded app.json deep-equals the listing's
 *    manifest (id/version can't drift from the published artifact)
 *
 * Zero dependencies (node >= 20). `--offline` skips the download step for
 * quick local iteration; CI always runs the full check.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestIssues, readZipEntries, sortKeys } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const offline = process.argv.includes("--offline");
const issues = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (slug, msg) => issues.push(`${slug}: ${msg}`);

const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_SIZE = 50 * 1024 * 1024;

function validateListingShape(slug, listing) {
  const known = new Set(["app", "artifact", "repo", "tags", "screenshots", "listedAt", "status", "yankedReason"]);
  for (const key of Object.keys(listing)) {
    if (!known.has(key)) bad(slug, `unknown listing field "${key}"`);
  }
  for (const req of ["app", "artifact", "repo", "listedAt", "status"]) {
    if (!(req in listing)) bad(slug, `missing required field "${req}"`);
  }
  const artifact = listing.artifact ?? {};
  if (typeof artifact.url !== "string" || !artifact.url.startsWith("https://")) bad(slug, "artifact.url must be https");
  if (!SHA256_RE.test(artifact.sha256 ?? "")) bad(slug, "artifact.sha256 must be 64 hex chars");
  if (!Number.isInteger(artifact.size) || artifact.size < 1 || artifact.size > MAX_SIZE) {
    bad(slug, `artifact.size must be 1..${MAX_SIZE} bytes`);
  }
  if (typeof listing.repo !== "string" || !listing.repo.startsWith("https://")) bad(slug, "repo must be an https URL");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(listing.listedAt ?? "")) bad(slug, "listedAt must be YYYY-MM-DD");
  if (!["active", "yanked"].includes(listing.status)) bad(slug, "status must be active|yanked");
}

async function verifyArtifact(slug, listing) {
  const { url, sha256, size } = listing.artifact;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return bad(slug, `artifact fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length !== size) bad(slug, `artifact size mismatch: listed ${size}, got ${buffer.length}`);
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digest !== sha256) return bad(slug, `artifact sha256 mismatch: listed ${sha256}, got ${digest}`);
  ok(`${slug}: artifact checksum verified (${(buffer.length / 1024).toFixed(0)} KB)`);

  const entry = listing.app.entry ?? "index.html";
  const zip = readZipEntries(buffer, ["app.json"]);
  if (!zip["app.json"]) return bad(slug, "zip is missing app.json");
  if (!zip.__names.includes(`dist/${entry}`)) bad(slug, `zip is missing dist/${entry}`);
  let embedded;
  try {
    embedded = JSON.parse(zip["app.json"].toString());
  } catch {
    return bad(slug, "zip app.json does not parse");
  }
  delete embedded.$schema;
  const listed = { ...listing.app };
  delete listed.$schema;
  if (JSON.stringify(sortKeys(embedded)) !== JSON.stringify(sortKeys(listed))) {
    bad(slug, "zip's embedded app.json differs from listing.app — the listing must carry the manifest verbatim");
  } else {
    ok(`${slug}: manifest == listing (v${embedded.version})`);
  }
}

const appsDir = join(root, "apps");
const slugs = existsSync(appsDir)
  ? readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
if (slugs.length === 0) {
  console.error("no listings found under apps/");
  process.exit(1);
}

for (const slug of slugs) {
  const path = join(appsDir, slug, "listing.json");
  if (!existsSync(path)) { bad(slug, "missing listing.json"); continue; }
  let listing;
  try {
    listing = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    bad(slug, `listing.json does not parse: ${e.message}`);
    continue;
  }
  const before = issues.length;
  validateListingShape(slug, listing);
  for (const issue of manifestIssues(listing.app ?? {}, slug)) bad(slug, issue);
  if (!offline && listing.status === "active" && issues.length === before) {
    await verifyArtifact(slug, listing);
  }
  if (issues.length === before) ok(`${slug}: listing valid`);
}

if (issues.length) {
  console.error("\nRegistry validation FAILED:");
  for (const issue of issues) console.error(`  ✗ ${issue}`);
  process.exit(1);
}
console.log(`\n✓ ${slugs.length} listing(s) valid${offline ? " (offline — artifacts not fetched)" : ""}`);
