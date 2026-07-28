# CLAUDE.md

Cortex Registry is the public, git-native catalog of apps that run **inside** a
[Cortex](https://github.com/mocaOS/cortex-app) instance. It is metadata-only:
this repo holds `listing.json` files and sha256 checksums, while the app
artifacts live on each publisher's GitHub releases. Instances consume the
aggregated `index.json` and re-verify every artifact against its pinned digest
before unpacking.

## Navigation Map

| File | Description |
|------|-------------|
| [`.claude/publishing.md`](.claude/publishing.md) | Publishing & version-bump runbook — release-before-listing ordering, `add-listing.mjs` field-loss gotchas, the expected diff, local CI checks |
| [`README.md`](README.md) | The publishing contract, local validation commands, conformance corpus, trust model |
| [`REVIEWING.md`](REVIEWING.md) | What a human reviewer checks before merging a listing |
| [`ECOSYSTEM.md`](ECOSYSTEM.md) | Master plan for the whole app ecosystem (app classes, phases, port map) |

## File-Path Routing

| Touching | Read |
|---|---|
| `apps/*/listing.json`, `index.json` | `.claude/publishing.md` |
| `scripts/add-listing.mjs`, `build-index.mjs` | `.claude/publishing.md` |
| `schema/*.json`, `conformance/manifests.json` | `README.md` § conformance corpus — a manifest rule lives in **three** implementations (this validator, the app template's `validate.mjs`, cortex-app's `validate_manifest`); change all three and add a corpus case |
| `scripts/check-docs-drift.mjs` | `.claude/publishing.md` § docs-drift |

## Ground rules

- **Listings are review-gated.** CI is the floor, not the gate — open a PR and
  leave the merge to a human, even when every check is green.
- **`index.json` is generated.** Never hand-edit it; run `build-index.mjs`.
- **Digests are the trust anchor.** Never replace a release asset under an
  existing tag; ship a new version. Never delete a listing; yank it.
- **Run CI locally before pushing:** `validate-listings.mjs`,
  `build-index.mjs --check`, `conformance.mjs`, `check-docs-drift.mjs`.
