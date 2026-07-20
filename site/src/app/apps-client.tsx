"use client";

import { useMemo, useState } from "react";
import type { summarize } from "@/lib/catalog";

type AppSummary = ReturnType<typeof summarize>;

const TYPES = ["all", "static", "platform", "service"] as const;

export function AppsClient({ apps }: { apps: AppSummary[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (type !== "all" && app.type !== type) return false;
      if (!q) return true;
      const haystack = [
        app.name,
        app.slug,
        app.description,
        app.publisher?.name,
        ...(app.tags ?? []),
        ...app.capabilities,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [apps, query, type]);

  return (
    <>
      <div className="controls">
        <input
          className="search"
          placeholder="search apps… (name, tag, capability)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {TYPES.map((t) => (
          <button
            key={t}
            className={`filter${type === t ? " active" : ""}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="count">
        {filtered.length} app{filtered.length === 1 ? "" : "s"}
        {query || type !== "all" ? ` (of ${apps.length})` : ""}
      </p>

      {filtered.length === 0 && (
        <p className="empty">nothing matches — try a different search.</p>
      )}

      {filtered.map((app) => (
        <article key={app.slug} className="app-item" id={app.slug}>
          <div className="app-title">
            <span className="app-name">{app.name}</span>
            <span className="app-version">v{app.version}</span>
            <span className={`badge ${app.type}`}>{app.type}</span>
            {app.keyScope && (
              <span className="badge">
                {app.keyScope === "read_write" ? "read + write" : "read-only"}
              </span>
            )}
          </div>
          <p className="app-desc">
            {app.description}
            {app.publisher?.name && <> — by {app.publisher.name}</>}
          </p>

          {app.tags.length > 0 && (
            <p className="meta-line">
              {app.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </p>
          )}
          <p className="meta-line">
            <span className="key">api access:</span>{" "}
            {app.endpoints.map((ep) => (
              <span key={ep} className="chip">
                {ep}
              </span>
            ))}
          </p>
          {app.capabilities.length > 0 && (
            <p className="meta-line">
              <span className="key">capabilities:</span>{" "}
              {app.capabilities.map((cap) => (
                <span key={cap} className="chip cap">
                  {cap}
                </span>
              ))}
            </p>
          )}

          <div className="install-hint">
            <span className="key">install:</span> your Cortex admin panel →
            Settings → Apps → Browse Registry — the instance verifies{" "}
            <span title={app.artifact.sha256}>
              sha256 {app.artifact.sha256.slice(0, 12)}…
            </span>{" "}
            before unpacking ({Math.round(app.artifact.size / 1024)} KB)
          </div>

          <div className="links">
            <a href={app.repo} target="_blank" rel="noopener noreferrer">
              source
            </a>
            <a href={app.artifact.url} target="_blank" rel="noopener noreferrer">
              release zip
            </a>
            <a href={`/api/apps/${app.slug}`}>listing.json</a>
          </div>
        </article>
      ))}
    </>
  );
}
