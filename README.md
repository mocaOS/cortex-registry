# Cortex Registry

The public catalog of apps that run **inside** a [Cortex](https://github.com/mocaOS/cortex-app)
instance. Git-native and metadata-only: this repo holds `listing.json` files
and checksums — the app artifacts themselves live on each publisher's GitHub
releases, pinned by sha256.

Cortex instances consume the catalog through the aggregated
[`index.json`](index.json); admins browse and install from **Settings →
Apps → Browse Registry**. Every install re-verifies the artifact against the
pinned checksum before anything is unpacked.

## Structure

```
schema/app.v1.json        the app manifest contract (canonical copy)
schema/listing.v1.json    the listing contract
apps/{slug}/listing.json  one listing per app (slug == app.json id)
index.json                generated catalog (scripts/build-index.mjs)
site/                     the browse site + JSON API (Next.js; renders index.json)
ECOSYSTEM.md              the master plan for the whole app ecosystem
```

## Publishing your app

Build it first — start from
[cortex-app-template](https://github.com/mocaOS/cortex-app-template), or point
your coding agent at [cortexskills.org/builder/app](https://cortexskills.org/builder/app/SKILL.md).

1. **Cut a release** in your app repo (clean, pushed tree):

   ```bash
   npm run package                      # → {id}-{version}.zip
   sha256sum {id}-{version}.zip
   gh release create v{version} {id}-{version}.zip --title "…" --notes "…sha256…"
   curl -sL <asset url> | sha256sum     # verify published == built
   ```

2. **Generate the listing** (in a checkout of this repo):

   ```bash
   node scripts/add-listing.mjs <release zip url> --tags docs,sync
   # downloads the artifact, extracts the manifest, pins sha256 + size,
   # writes apps/{id}/listing.json and rebuilds index.json
   ```

   (Apps built from the template release with `git tag v{version} &&
   git push --tags` — the shipped workflow builds, validates, and attaches
   the zip automatically.)

   Or write the listing by hand — `apps/{your-id}/listing.json`:

   ```jsonc
   {
     "app": { /* your app.json, VERBATIM (minus $schema) */ },
     "artifact": {
       "url": "https://github.com/you/your-app/releases/download/v1.0.0/your-app-1.0.0.zip",
       "sha256": "…64 hex chars…",
       "size": 123456
     },
     "repo": "https://github.com/you/your-app",
     "tags": ["…"],
     "screenshots": [],
     "listedAt": "2026-07-20",
     "status": "active"
   }
   ```

   Then regenerate the catalog: `node scripts/build-index.mjs`.

3. **Open a PR.** CI is the floor, review is the gate ([REVIEWING.md](REVIEWING.md)). The workflow re-downloads your
   artifact, re-verifies the sha256 and size, checks the zip's embedded
   `app.json` equals your listing's manifest, and validates both schemas.
   A human reviews what the app declares (key scope, endpoints, external
   hosts, capabilities) before merge.

**New versions:** new tag + new zip + a PR bumping `app.version` and the
`artifact` block. Never replace the asset under an existing tag — the pinned
digest is the trust anchor.

**Yanking:** a listing is never deleted; set `"status": "yanked"` (+
`yankedReason`) via PR. Instances stop offering yanked apps for install.

## Validating locally

```bash
node scripts/validate-listings.mjs            # full check incl. artifact download
node scripts/validate-listings.mjs --offline  # shape/manifest checks only
node scripts/build-index.mjs --check          # is index.json current?
node scripts/conformance.mjs                  # manifest rules vs the shared corpus
```

CI runs all of this on every PR **and on a weekly schedule** — so a deleted
or replaced release asset surfaces here, not at someone's install.

### The conformance corpus

`conformance/manifests.json` is the shared floor of manifest rules, enforced
by three independent implementations: this repo's validator, the app
template's `validate.mjs`, and cortex-app's server-side `validate_manifest`.
Each repo's CI runs its own consumer against the corpus — a rule change that
reaches only one implementation fails the other two. Changing a manifest
rule therefore means: update all three implementations **and** add a corpus
case here.

## Trust model

- **sha256-pinned artifacts** — the listing commits to exact bytes; CI and
  every installing instance verify independently.
- **Manifest transparency** — the listing carries the manifest verbatim, so
  what an admin approves in the browser is what the zip contains (CI proves
  the equality).
- **Least privilege is visible** — key scope, endpoint allowlist, external
  hosts, and capabilities are all in the listing for review before install.
- Reserved for later: publisher signing (`signatures` in the manifest
  schema), x402 `cortexes/` directory, monetized listings.
