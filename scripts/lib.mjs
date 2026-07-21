/** Shared helpers for the registry scripts (zero dependencies, node >= 20). */

import { inflateRawSync } from "node:zlib";

/** Minimal zip reader: central directory → {name: bytes} for wanted files;
 * `__names` carries the full entry list. */
export function readZipEntries(buffer, wanted) {
  const entries = {};
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

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

/** The registry's manifest rules (the shared floor — see conformance/).
 * Returns the full issues list; `slug` (optional) additionally pins
 * directory name == app.id. */
export function manifestIssues(app, slug) {
  const issues = [];
  const bad = (msg) => issues.push(msg);
  if (typeof app !== "object" || app === null) return ["app must be the manifest object"];
  if (!SLUG_RE.test(app.id ?? "")) bad(`app.id must be a kebab-case slug (got ${JSON.stringify(app.id)})`);
  if (slug !== undefined && app.id !== slug) bad(`directory name must equal app.id (${app.id})`);
  if (!SEMVER_RE.test(app.version ?? "")) bad("app.version must be semver");
  if (!["static", "platform", "service"].includes(app.type)) bad("app.type must be static | platform | service");
  if (typeof app.name !== "string" || app.name.length < 1 || app.name.length > 80) bad("app.name required (1-80)");
  if (typeof app.description !== "string" || app.description.length < 1 || app.description.length > 200) bad("app.description required (1-200)");
  if (typeof app.publisher?.name !== "string" || !app.publisher.name) bad("app.publisher.name required");
  const cortex = app.cortex;
  if (typeof cortex !== "object" || cortex === null) return [...issues, "app.cortex block required"];
  if (!["read", "read_write"].includes(cortex.keyScope)) bad("cortex.keyScope must be read|read_write");
  if (!Array.isArray(cortex.endpoints) || cortex.endpoints.length === 0 ||
      !cortex.endpoints.every((e) => typeof e === "string" && e && !e.startsWith("/"))) {
    bad("cortex.endpoints must be a non-empty list of /api/-relative paths");
  }
  for (const v of app.config ?? []) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(v?.name ?? "")) bad(`config var ${JSON.stringify(v?.name)} must be UPPER_SNAKE`);
    if (!["text", "secret"].includes(v?.type)) bad(`config var ${v?.name}: type must be text | secret`);
    if (v?.auth_host !== undefined && (typeof v.auth_host !== "string" || !v.auth_host.trim())) {
      bad(`config var ${v?.name}: auth_host must be a hostname or \${CONFIG_VAR} ref`);
    }
  }
  const caps = app.capabilities ?? {};
  if (Object.keys(caps).length && app.type !== "platform") bad("capabilities only valid for type: platform");
  if (caps.http && (!Array.isArray(caps.http.hosts) || caps.http.hosts.length === 0)) {
    bad("capabilities.http.hosts must be a non-empty list");
  }
  return issues;
}
