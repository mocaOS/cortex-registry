# Cortex App Ecosystem — Master Plan

> Status: v1 IN EXECUTION (2026-07-20). Phase 1 done (template proven, /builder
> skills hardened via Demo 1). Phase 2 done and live-verified (hosting core,
> sandboxed serving, tokens, share links, SSE proxy, admin UI + launcher).
> Phase 2.5 CORE DONE: `http`, config-read, `storage` (per-app SQLite KV),
> `tasks` (declarative step-queue engine w/ schedules, boot resume, llm
> chunk/validate policies), and `llm` (task-step completions, metered) are
> implemented in cortex-app with both §5.2 acceptance shapes covered by
> engine tests (paperless-style scheduled sync + yt-transcriber-style batch).
> LIVE-VERIFIED 2026-07-20: cortex-app-paperless v0.3.0 converted to a
> platform task (client sync loop deleted) — 342 real paperless docs synced
> server-side in ~26s, idempotent re-run, cursor + storage dedup working.
> DEMO 2 BUILT same day: cortex-app-youtube-transcriber (Class-B port per §8) —
> channel scraping via proxied http (EU consent cookie), transcribe/refine/
> upload as three tasks, refine + upload live-verified against the instance
> LLM; only Venice-key transcription awaits admin config. Shipped alongside:
> `auth_host` per-credential host scoping (multi-host apps), http envelope
> `headers`, upgrades preserve storage+tasks, template `platform.ts` client,
> /builder/app/tasks.md DSL reference.
> Remaining 2.5: features/branding endpoints, standalone llm endpoint.
> PHASE 3 CORE BUILT 2026-07-20: registry repo (listing.v1 + app.v1 schemas,
> seed listings for both released apps, CI that re-downloads artifacts and
> re-verifies sha256 + manifest==zip, generated index.json catalog, README
> submission/release contract) + the consumer in cortex-app (APP_REGISTRY_URL,
> GET /api/admin/apps/registry joined w/ install state, sha256-verified
> install-from-registry, admin "Browse Registry" panel). Both apps' GitHub
> releases cut & verified. Browse site BUILT (site/: Next.js, cortexskills
> aesthetic, search/filters, JSON API /api/apps[?q,type] + /api/apps/{slug};
> reads local index.json, falls back to raw GitHub when deployed detached).
> Remaining Phase 3: deploy the site (domain undecided — registry.cortex.eco?);
> Demo 3 (install-from-registry on an instance) once this repo is pushed.
> Scope: builder skills, app template, in-instance app hosting, app discovery.
> Parked: x402 cortex directory aggregation, monetized listings, ratings.

## 1. Vision

Anyone with a coding-agent subscription can turn *any* software's docs into a
Cortex skill, and *any* app idea into a web app that runs **inside** their
Cortex instance — installed as a zip, no self-hosting knowledge required.
Private by default, publishable to a public registry with one PR.

The moat is not code generation (users bring their own agent). The moat is:

1. **Ground-truth knowledge** (cortex-skills) that makes any agent produce a
   *correct* integration on the first try.
2. **A hosting contract** (cortex-app) that makes the result deployable by an
   average admin in one upload.
3. **A discovery layer** (cortex-registry) that compounds every published app
   into ecosystem growth.

## 2. System overview

```
 App Developer (own coding agent + subscription)
   │  "Fetch cortexskills.org/builder/… and build me X"
   ▼
 cortex-skills ──► /builder  /builder/skill  /builder/app     (knowledge)
   │
   ▼
 mocaOS/cortex-app-template ──► validate ──► package ──► my-app-1.0.0.zip
   │                                                        │
   │ SKILL.md → install-from-URL (existing flow)            │
   ▼                                                        ▼
 cortex-app  ◄──────────── install zip (private) ───────────┘
   Apps subsystem: unpack / mint key / sandbox / proxy / share links
   ▲
   │ install-from-registry (fetch artifact, verify sha256)
   │
 mocaOS/cortex-registry ──► listing.json catalog + browse site + JSON API
                            (apps now, x402 cortex directory later)
```

| Repo | Role | Never contains |
|---|---|---|
| `cortex-skills` | Teaches agents to build skills & apps (markdown only) | Code, tooling, registry data |
| `cortex-app-template` (new) | The contract-in-code: scaffold, dev loop, validate, package | Registry logic |
| `cortex-app` | Runtime: install, host, sandbox, key-scope, proxy | Store curation |
| `cortex-registry` | Discovery: metadata catalog + site + JSON API | App artifacts (metadata + checksums only) |

## 3. App classes

One manifest, three types. Type determines runtime, security surface, and
distribution shape.

### Class A — `static`
Client-only SPA. Talks to Cortex through the app proxy. Zero marginal RAM.
Examples: graph dashboards, explorers, viewers, report builders.

### Class B — `platform`
Static UI **plus declared capabilities served by cortex-app**: task queue,
storage, external HTTP with secret injection, LLM calls, feature detection,
branding. No app-shipped server code — everything runs in the backend's
existing async loop. This is the "spawn an app inside your cortex" class.
Canonical example: yt-transcriber (see §8 port map).

### Class C — `service`
Own container. For local ML, binaries (yt-dlp), non-Node runtimes, or apps
that genuinely need arbitrary server code (cortex-chat). **Never spawned by
cortex-app** (no Docker-socket power in the backend — hard line). Distribution:
compose fragment / Coolify template for self-hosters; meta-cortex provisions
tenant sidecars for the cloud fleet. Gets the delegated-provisioning key scope
(§6.4) so it never needs a full admin key again.

**Escape-hatch rule:** if an app's server logic can't be expressed as Class B
declarative capabilities, it's Class C. We do not embed a JS plugin runtime in
the Python backend (revisit only if the ecosystem demands it — Phase 4+).

## 4. The contracts

Everything below is frozen in Phase 1 before any code exists. These five
contracts are the whole system; every repo implements its side of them.

### 4.1 `app.json` manifest (v1)

```jsonc
{
  "$schema": "https://registry.cortex.eco/schema/app.v1.json",
  "id": "paperless-triage",              // kebab, globally unique in registry
  "name": "Paperless Triage",
  "version": "1.0.0",                    // semver
  "type": "static",                      // static | platform | service
  "description": "One-liner shown in launcher and registry",
  "publisher": { "name": "reneil", "url": "https://github.com/…" },
  "icon": "icon.svg",
  "entry": "index.html",                 // static/platform only

  "cortex": {
    "minVersion": "2.0.0",               // checked against platform/features
    "keyScope": "read",                  // read | read_write
    "endpoints": ["search", "ask", "graph/entities"],  // proxy allowlist
    "collections": "user-selected"       // "user-selected" | "all" | ["names"]
  },

  // Class B only — admin sees & approves each at install
  "capabilities": {
    "tasks":    {},                                  // §5.2 task queue
    "storage":  {},                                  // per-app KV/doc store
    "http":     { "hosts": ["api.venice.ai"] },      // server-side, secret-injected
    "llm":      {},                                  // instance LLM via proxy (metered)
    "features": {},                                  // GET instance feature flags
    "branding": {}                                   // GET instance accent/logo/lang
  },

  // Config wizard reuse: same field semantics as skill config schemas
  "config": [
    { "name": "PAPERLESS_BASE_URL", "type": "text",   "required": true },
    { "name": "PAPERLESS_TOKEN",    "type": "secret",
      "auth_header": "Authorization: Token PAPERLESS_TOKEN" }
  ],

  "externalHosts": ["${PAPERLESS_BASE_URL}"],  // browser-direct; CSP connect-src

  "sharing": { "links": true },          // owner may mint share links (§7.2)
  "users": false,                        // Stage 2 app-user accounts (§7.3)

  // Class C only
  "service": {
    "image": "ghcr.io/…",
    "compose": "deploy/docker-compose.app.yml",
    "requiredKeyScope": "read"           // read | read_write | delegated-provisioning
  }
}
```

Reserved for later (schema tolerates, runtime ignores): `appContext` (server-
injected context blocks à la `<cortexchatanalytics>`), `pricing` (x402),
`signatures`.

### 4.2 Package format

`{id}-{version}.zip` = `app.json` + `icon.svg` + `dist/` (static assets,
`entry` inside dist). Size cap 50 MB. Produced by `npm run package` in the
template; consumed by cortex-app's installer and referenced by registry
listings. Class C packages contain `app.json` + `deploy/` instead of `dist/`.

### 4.3 App token

Short-lived HMAC-signed token (reuse session-secret infra), the *only*
credential an app's browser code ever holds:

```
{ v: 1, app: "<slug>", principal: "owner" | "link:<grantId>" | "appuser:<id>",
  role: "admin" | "editor" | "viewer", iat, exp (≤15 min), jti }
```

Issued: to logged-in cortex users by the launcher (postMessage into the
sandboxed iframe, silent renewal); to share-link visitors by grant exchange
(§7.2). Validates **only** on `/apps/{slug}/api/*`. The main API and UI never
accept it; app pages never see a cortex session cookie.

### 4.4 Proxy & serving contract

```
GET  /apps/{slug}/…                    static files (dist/), CSP-stamped
ANY  /apps/{slug}/api/cortex/{path}    → internal API with app's minted key,
                                         endpoint-allowlist enforced,
                                         SSE streaming passes through UNBUFFERED
ANY  /apps/{slug}/api/platform/{path}  → Class B capabilities (§5)
GET  /a/{slug}?g={grant}               share-link entry (cookie-less shell)
```

Non-negotiables learned from cortex-chat: zero secrets and zero deploy-specific
values in the browser bundle; SSE must stream through the proxy without gzip
buffering (chat-like apps are impossible otherwise); per-app usage metering at
the proxy (plugs into existing api_usage accounting).

App-side rules (enforced by template validator): all calls relative
(`./api/…`), no absolute `/api`, no hardcoded keys, runtime config only.

### 4.5 Registry `listing.json`

```jsonc
{
  "app": { /* app.json, verbatim */ },
  "artifact": { "url": "https://github.com/…/releases/download/v1.0.0/….zip",
                "sha256": "…", "size": 1234567 },
  "repo": "https://github.com/…",
  "tags": ["documents", "paperless"],
  "screenshots": ["screenshots/1.png"],
  "listedAt": "2026-07-20",
  "status": "active"                     // active | yanked
}
```

Registry stores metadata only; artifacts live on the publisher's GitHub
releases, pinned by sha256. Yank = status flip, never deletion.

## 5. App Platform API (Class B capabilities)

Each capability is a thin adapter over machinery cortex-app already has.
All routes under `/apps/{slug}/api/platform/`, gated by manifest declaration.

### 5.1 `features` & `branding` (trivial, ship first)
- `GET platform/features` → cortex version, enabled flags (web crawl, x402, …),
  available capabilities. Manifest `minVersion` checks against this; apps
  degrade gracefully across heterogeneous instances (cortex-chat pattern).
- `GET platform/branding` → instance accent, logo URL, title, language —
  installed apps look native to each tenant with zero effort.

### 5.2 `tasks` — the hard design, resolved declaratively
Apps ship no server code, so background work is a **queue of declarative
steps**, not arbitrary functions. An app submits a task list; the backend
executes it headless (browser closed) with the persistence/pause/resume/retry
semantics of the existing task system:

```jsonc
POST platform/tasks
{ "name": "transcribe-batch",
  "items": [ { "steps": [
    { "http": { "method": "POST", "url": "https://api.venice.ai/…",
                "body": { "url": "{item.videoUrl}" } } },       // secrets injected
    { "store": { "key": "transcripts/{item.id}", "from": "$prev" } }
  ], "vars": { "videoUrl": "…", "id": "…" } }, … ],
  "concurrency": 3 }
```

Step vocabulary v1 (LOCKED 2026-07-20, implemented in cortex-app
`app_task_dsl.py`/`app_task_service.py`): `http` (secret-injected,
host-allowlisted, + `paginate` w/ `keyBy` for joins), `cortex` (endpoint-
allowlisted API calls incl. multipart-from-text uploads), `llm` (prompt
template + built-in chunking & validation policies: length-ratio,
word-overlap, retry-once-else-keep-original — yt-transcriber's chunk-safety
rules became platform policies), `store` (get/put/delete/list on the app's
storage), `template` (text or conditional lines), `skipItem`. Definitions
gained `setup`/`finally` sections, fan-out `items.from` with `skipIfStored`
dedup, and `schedule.everyMinutes` — a scheduled task IS the headless cron
sync. Control: `GET/PATCH platform/tasks/{id}`
(pause/resume/cancel/retryFailed/runNow); boot resume + per-minute
scheduler. Complex orchestration logic beyond this runs client-side when
composing the item list; the *execution* is what needs to survive a closed
tab, and it does.

If the DSL can't express it → the app is Class C. That line keeps Class B
secure and the backend free of embedded runtimes.

### 5.3 `storage`
Per-app SQLite file in the `apps_data` volume (namespaced, quota-capped).
API: KV + JSON docs — `GET/PUT/DELETE platform/storage/{key}`, prefix list,
optional per-principal namespacing (ready for app users). No cross-app access.

### 5.4 `http`
Server-side external calls with secrets injected from the app's encrypted
config (same Fernet machinery + `auth_header` semantics as skills), restricted
to manifest-declared hosts. Removes the v1 limitation of browser-direct
external calls for anything credentialed.

### 5.5 `llm`
Chat completions through the instance's configured model via the existing
llm_config factory — counted by unit metering (MAX_QUERIES_PER_MONTH), traced
by Langfuse, attributed to the app. Per-app quota configurable at install.

## 6. Security model

1. **Sandboxed iframe**: launcher embeds `/apps/{slug}` with
   `sandbox="allow-scripts"` (no `allow-same-origin`) → opaque origin: no
   cookie access, no parent DOM, SameSite keeps session cookies off its
   fetches. App token arrives via postMessage.
2. **No raw keys in the browser, ever.** Install mints a dedicated scoped API
   key per app (scope + collections from manifest); it lives server-side and
   is applied by the proxy. Revocation = instant kill.
3. **Endpoint allowlist** from `cortex.endpoints`, enforced at the proxy.
   Admin approves scope + endpoints + external hosts + capabilities at install.
4. **Delegated-provisioning key scope** (new, motivated by cortex-chat): a key
   that may only mint/revoke read keys scoped to named collections. Class C
   apps use this instead of admin-tier keys.
5. **CSP per app page**: `default-src 'self'`, `connect-src 'self'` +
   `externalHosts`. Stamped by the static-file handler.
6. **Share-link grants**: signed, revocable, optional expiry/passphrase,
   role-limited; exchange endpoint rate-limited; grants listable/killable in
   admin.
7. **Registry integrity**: sha256-pinned artifacts, CI re-verification, yank
   mechanism, size caps. (Signing/publisher verification reserved in schema.)
8. **Metering**: proxy attributes every call (cortex + platform) to the app;
   llm capability counts toward instance quota.

## 7. Identity roadmap (app users ≠ cortex users)

### 7.1 Owner (Phase 2)
Logged-in cortex users launch apps; token principal `owner`.

### 7.2 Share links (Phase 2, same release)
Admin mints per-app grants → `/a/{slug}?g=…` (or tenant-proxy subdomain
later). Visitors get app tokens with `principal: "link:<id>"`; they can never
log into cortex-app because nothing they hold validates outside
`/apps/{slug}/api/*`. Covers "spawned the transcriber, here's the link for my
community" with zero account management.

### 7.3 App users (Stage 2 — after demand)
`AppUser` principal in auth_service: email + magic-link/password, membership
per app, sessions valid only at the app proxy. **Blueprint = cortex-chat's
auth** (argon2id, opaque sliding-TTL sessions, group→collection scoping) —
port, don't invent. Manifest flag `"users": true`; apps receive
`principal.id` per request (per-user storage namespaces already reserved).

### 7.4 Workspace model (Stage 2+, direction only)
One tenant-level identity, N apps (per-app membership). Token claims already
shaped for it. Decide when ≥2 apps need shared users.

## 8. Validation demos (definition of done)

**Demo 1 — the paperless loop (proves Phase 1):**
coding agent + `/builder/skill` + docs.paperless-ngx.com → SKILL.md →
install-from-URL → config wizard extracts schema → `http_request` works.
Then `/builder/app` + template → triage app running via `npm run dev` against
a live instance. No cortex-app changes needed yet.

**Demo 2 — yt-transcriber port (proves Class B / Phase 2.5):**

| yt-transcriber today (Class C) | Class B port |
|---|---|
| Next.js API routes | gone — UI + proxy |
| SQLite (projects/videos) | `platform/storage` |
| Worker pool, pause/resume/retry | `platform/tasks` (concurrency: 3) |
| Venice key in env | encrypted app config + `platform/http` |
| Refinement LLM + chunk safety | `platform/llm` with validation policies |
| Entity search for name correction | `api/cortex/graph/entities` (allowlisted) |
| Self-hosted by user | zip upload; shared via link with the community |

**Demo 3 — registry loop (proves Phase 3):** publish demo 2's app via PR,
install it on a second instance from the admin registry browser.

## 9. Per-repo workplans

### 9.1 cortex-skills (stays lean — 3 markdown folders)
- `/builder` — index: the loop, app classes, which sub-skill to fetch.
- `/builder/skill` — docs→SKILL.md recipe; paperless worked example; encodes
  what the runtime rewards: `{UPPER_SNAKE}` placeholders + explicit credential
  mentions (config-wizard reliability), `*_BASE_URL` var (hostname-scoped
  auth), `auth_header` conventions, pagination hints; self-review checklist +
  "install via URL and verify /analyze extracts the schema".
- `/builder/app` — template pointer; manifest semantics; class decision tree
  (A vs B vs C); proxy/token rules ("never embed a key; call `./api/…`");
  `/cortex-design` for aesthetics; platform API guide; validate + package;
  both endings (private upload / registry PR). Class C checklist distilled
  from cortex-chat: runtime-only config, fail-fast validation, named volumes,
  same-image-any-tenant, no `NEXT_PUBLIC_` secrets.
- Root `SKILL.md` index + llms.txt updated.

### 9.2 mocaOS/cortex-app-template (new; GitHub template repo)
Vite + React + Tailwind, cortex-design tokens pre-wired. Typed client for the
proxy contract (token via postMessage, silent renewal, SSE streaming helper).
`app.json` + JSON schema + inline docs. `npm run dev` (proxies `./api/*` to a
real instance using a dev key from `.env` — build against live data before
hosting exists). `npm run validate` (schema, entry exists, no absolute /api,
no hardcoded keys, size cap) — **this is Path B**, living where the code
lives. `npm run package` → `{id}-{version}.zip`. Example page: search +
streaming ask with citations.

### 9.3 cortex-app
Backend: `app_service.py` (install/unpack/validate/mint key/configure/delete;
`apps_data` volume), `app_platform_service.py` (capabilities §5),
`app_proxy` routes (token validation, allowlist, SSE pass-through, metering),
share-link grants, delegated-provisioning key scope in api_key_service,
manifest + config models (reuse wizard field semantics + Fernet encryption).
Frontend: Apps launcher (grid + sandboxed-iframe host page), admin Apps
manager (upload/install-from-registry/configure/keys/grants/delete),
`/a/{slug}` cookie-less shell. Docs per maintenance rules: new
`.claude/domain/apps.md`, routing-table + navigation-map entries,
environment.md (new env: app hosting flag, quotas, registry URL),
documentation/ + handbook pages.

### 9.4 cortex-registry
```
apps/{slug}/listing.json + screenshots/
cortexes/            # later: x402 directory (structure reserved, empty)
schema/              # app.v1.json, listing.v1.json (single source of truth)
site/                # Next.js browse/search UI, cortexskills.org aesthetic
.github/workflows/validate.yml   # schema check, artifact fetch, sha256,
                                 # manifest==listing, entry exists, size cap
```
JSON API (`GET /api/apps?q=…&type=…`, `GET /api/apps/{slug}`) consumed by the
cortex-app admin browser (SkillsManager-clone pattern). Submission = PR with
template; CI is the floor, human review is the gate. Seed with 2–3 first-party
apps so it never launches empty. Deploy like cortex-skills (Vercel).

## 10. Phases

| Phase | Deliverable | Effort | Exit criterion |
|---|---|---|---|
| **1. Contracts + knowledge** | Freeze §4 schemas; template repo; `/builder` pack | ~2–4 days | Demo 1 passes end-to-end with a real coding agent |
| **2. Hosting core** | cortex-app: install/serve/sandbox/proxy(SSE)/mint keys/share links; Apps UI; delegated-provisioning scope | ~1–2 wks | A template-built zip uploads, runs sandboxed, streams ask; share link works for a logged-out visitor |
| **2.5 Platform API** | features/branding → storage → tasks → http → llm | ~1–2 wks | Demo 2: yt-transcriber port runs headless batch with browser closed |
| **3. Registry** | Schema+CI, site, JSON API, admin registry browser | ~1 wk (parallel w/ late 2.5) | Demo 3: PR→browse→install on a second instance |
| **Stage 2 (later)** | App users (cortex-chat blueprint), workspace direction | on demand | An app with `"users": true` onboards a non-cortex user |
| **Phase 4 (parked)** | x402 `cortexes/` directory, monetized listings, signing, app-context injection, sandboxed server code (only if DSL proves too tight) | — | — |

Dependencies: 2 needs 1's frozen contracts; 2.5 needs 2's proxy/token core;
3 needs only §4.5 + 2's installer (parallelizable); Stage 2 needs 2.

## 11. Decisions

**Decided (defaults — flag disagreement before Phase 1 freeze):**
- Sandboxed iframe + app-token proxy; never raw keys in the browser.
- Class B via declarative capabilities; no embedded JS runtime in the backend;
  DSL-overflow → Class C.
- cortex-app never orchestrates containers; Class C spawning = meta-cortex
  (cloud) / compose templates (self-host).
- GitHub template repo first; `create-cortex-app` npm wrapper later.
- Share links path-based (`/a/{slug}`) in v1; subdomains when meta-cortex
  automates tenant DNS.
- Registry = git-native, PR-moderated, metadata-only, Vercel-deployed.
- cortex-chat stays Class C (donor, not port target); yt-transcriber is the
  Class B port demo.

**Open (needed before the phase that consumes them):**
- Naming: "Apps"? launcher placement in nav? (Phase 2 UI)
- ~~Default per-app llm quota + storage quota values~~ — DECIDED 2026-07-20:
  storage 50 MB/app + 1 MB/value; llm 500 calls/run; items 2000/task;
  concurrency 4/task + 8 global; schedule floor 15 min (all env-tunable,
  `APP_*` in cortex-app environment.md).
- ~~Task-step DSL v1 final vocabulary~~ — LOCKED 2026-07-20 (see §5.2);
  designed against both real job shapes, engine-tested; the live
  yt-transcriber port app remains as the end-to-end demo.
- Registry domain (registry.cortex.eco?) + whether cortexskills.org
  cross-links. (Phase 3)

## 12. Risks

- **DSL expressiveness** (top risk): if real apps constantly overflow to
  Class C, Class B's promise weakens. Mitigation: yt-transcriber port is the
  Phase 2.5 acceptance test; validation policies absorb the known hard bits;
  explicit Phase 4 escape hatch (sandboxed server code) if proven necessary.
- **Same-origin escape**: sandbox misconfiguration would expose session
  cookies. Mitigation: no `allow-same-origin` ever; `/a/` shell cookie-less;
  add a QA test that an installed hostile app cannot read cookies or call
  `/api/admin/*`.
- **Registry trust**: malicious listings. Mitigation: sha256 pinning, CI
  re-verification, human-review gate, yank flow; signing reserved in schema.
- **Backend load** from platform tasks on small instances. Mitigation:
  concurrency caps + quotas per app; tasks are API-bound not CPU-bound; the
  RAM ceiling stays untouched (no new containers).
- **Contract churn** after apps exist in the wild. Mitigation: `$schema`
  versioning from day one; additive-only within v1; Phase 1 demo before
  freeze.
