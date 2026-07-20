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
import { inflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const offline = process.argv.includes("--offline");
const issues = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (slug, msg) => issues.push(`${slug}: ${msg}`);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_SIZE = 50 * 1024 * 1024;

function validateManifest(slug, app) {
  if (typeof app !== "object" || app === null) return bad(slug, "app must be the manifest object");
  if (!SLUG_RE.test(app.id ?? "")) bad(slug, `app.id must be a kebab slug (got ${JSON.stringify(app.id)})`);
  if (app.id !== slug) bad(slug, `directory name must equal app.id (${app.id})`);
  if (!SEMVER_RE.test(app.version ?? "")) bad(slug, "app.version must be semver");
  if (!["static", "platform", "service"].includes(app.type)) bad(slug, "app.type must be static|platform|service");
  if (typeof app.name !== "string" || app.name.length < 1 || app.name.length > 80) bad(slug, "app.name required (1-80)");
  if (typeof app.description !== "string" || app.description.length < 1 || app.description.length > 200) bad(slug, "app.description required (1-200)");
  if (typeof app.publisher?.name !== "string" || !app.publisher.name) bad(slug, "app.publisher.name required");
  const cortex = app.cortex;
  if (typeof cortex !== "object" || cortex === null) return bad(slug, "app.cortex block required");
  if (!["read", "read_write"].includes(cortex.keyScope)) bad(slug, "cortex.keyScope must be read|read_write");
  if (!Array.isArray(cortex.endpoints) || cortex.endpoints.length === 0 ||
      !cortex.endpoints.every((e) => typeof e === "string" && e && !e.startsWith("/"))) {
    bad(slug, "cortex.endpoints must be a non-empty list of /api/-relative paths");
  }
  for (const v of app.config ?? []) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(v?.name ?? "")) bad(slug, `config var ${JSON.stringify(v?.name)} must be UPPER_SNAKE`);
    if (!["text", "secret"].includes(v?.type)) bad(slug, `config var ${v?.name}: type must be text|secret`);
    if (v?.auth_host !== undefined && (typeof v.auth_host !== "string" || !v.auth_host.trim())) {
      bad(slug, `config var ${v?.name}: auth_host must be a hostname or \${CONFIG_VAR} ref`);
    }
  }
  const caps = app.capabilities ?? {};
  if (Object.keys(caps).length && app.type !== "platform") bad(slug, "capabilities only valid for type platform");
  if (caps.http && (!Array.isArray(caps.http.hosts) || caps.http.hosts.length === 0)) {
    bad(slug, "capabilities.http.hosts must be a non-empty list");
  }
}

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

/** Minimal zip reader: central directory → {name: bytes} for the files we need. */
function readZipEntries(buffer, wanted) {
  const entries = {};
  // find End Of Central Directory
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("not a zip (no EOCD)");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("bad central directory");
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    names.push(name);
    if (wanted.includes(name)) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      entries[name] = compression === 0 ? data : inflateRawSync(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  entries.__names = names;
  return entries;
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

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
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
  validateManifest(slug, listing.app ?? {});
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
