/**
 * Catalog access — one source of truth for the site and its JSON API.
 *
 * Reads the repo's generated index.json from disk when the site runs inside
 * the registry repo (local dev, monorepo deploys); falls back to the raw
 * GitHub URL (REGISTRY_INDEX_URL overridable) so a detached deployment
 * (e.g. Vercel with root=site/) still works.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const RAW_INDEX_URL =
  process.env.REGISTRY_INDEX_URL ??
  "https://raw.githubusercontent.com/mocaOS/cortex-registry/main/index.json";

export interface Listing {
  slug: string;
  app: {
    id: string;
    name: string;
    version: string;
    type: string;
    description: string;
    publisher?: { name?: string; url?: string };
    cortex?: { keyScope?: string; endpoints?: string[] };
    capabilities?: Record<string, unknown>;
    config?: Array<{ name: string; type: string }>;
    sharing?: { links?: boolean };
  };
  artifact: { url: string; sha256: string; size: number };
  repo: string;
  tags?: string[];
  listedAt: string;
  status: "active" | "yanked";
}

export async function loadCatalog(): Promise<Listing[]> {
  let raw: string;
  try {
    raw = await readFile(join(process.cwd(), "..", "index.json"), "utf8");
  } catch {
    const res = await fetch(RAW_INDEX_URL, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
    raw = await res.text();
  }
  const index = JSON.parse(raw) as { apps: Listing[] };
  return index.apps.filter((listing) => listing.status === "active");
}

export function summarize(listing: Listing) {
  return {
    slug: listing.slug,
    name: listing.app.name,
    version: listing.app.version,
    type: listing.app.type,
    description: listing.app.description,
    publisher: listing.app.publisher ?? {},
    repo: listing.repo,
    tags: listing.tags ?? [],
    keyScope: listing.app.cortex?.keyScope,
    endpoints: listing.app.cortex?.endpoints ?? [],
    capabilities: Object.keys(listing.app.capabilities ?? {}).sort(),
    artifact: listing.artifact,
    listedAt: listing.listedAt,
  };
}
