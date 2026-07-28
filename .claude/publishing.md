# Publishing & version bumps

Operational notes for changing listings. [README.md](../README.md) documents the
publishing contract; this file records the parts that only show up when you
actually run it.

## Strict ordering: release first, listing second

`scripts/add-listing.mjs` **downloads the artifact** to pin its sha256 and size.
The GitHub release must therefore already exist before you touch this repo —
there is no way to prepare a listing for an unpublished release.

You also cannot precompute the digest from a local `npm run package`. The zip is
not byte-reproducible: `package.mjs` uses `fflate`'s default per-entry
timestamps, so a local build and the CI build of the *same commit* produce the
same **size** but different **sha256**. Verified on yt-transcriber 0.1.5 — both
76193 bytes, digests `8e1880ba…` (local) vs `9899d68a…` (CI, the published one).
Always pin what CI published.

## `add-listing.mjs` regenerates the listing wholesale — preserve tags + date

The script writes a fresh `listing.json` from scratch. Fields it does **not**
carry over from the existing listing:

| Field | Bare-run default | Consequence |
|---|---|---|
| `tags` | `[]` | listing loses its catalog tags |
| `listedAt` | today's date | original listing date is rewritten |
| `screenshots` | `[]` | any screenshots dropped |

None of these failures are caught by CI — schemas allow empty tags and any
valid date. **Read the current listing first and pass the values back:**

```bash
node scripts/add-listing.mjs <release zip url> \
  --tags youtube,transcription,venice,llm \
  --date 2026-07-20            # the ORIGINAL listedAt, not today
```

`listedAt` means "when this app was first listed", so a version bump keeps the
original date. Only `--repo` is inferred safely (from a github.com release URL).

## Version bump, end to end

Worked example: yt-transcriber 0.1.4 → 0.1.5.

```bash
# 1. app repo — app.json is the single source of version truth.
#    (Template apps' package.json version is stale and unused; the release
#    workflow asserts tag == app.json version and fails the release on drift.)
$EDITOR app.json                      # bump "version"
npm run package                       # smoke test: build + validate + zip
git commit -am "…" && git push
git tag v0.1.5 && git push origin v0.1.5   # tag push IS the release trigger
gh run watch <id> --exit-status       # CI builds, validates, publishes + prints sha256

# 2. this repo — branch, then regenerate (preserving tags + date)
git checkout -b listing/yt-transcriber-0.1.5
node scripts/add-listing.mjs \
  https://github.com/mocaOS/cortex-app-youtube-transcriber/releases/download/v0.1.5/yt-transcriber-0.1.5.zip \
  --tags youtube,transcription,venice,llm --date 2026-07-20

# 3. expect a 4-field diff in BOTH listing.json and index.json:
#    version, artifact.url, artifact.sha256, artifact.size — nothing else.
git diff

# 4. run what CI runs, then PR (review-gated — don't self-merge)
node scripts/validate-listings.mjs   # incl. artifact re-download + manifest==listing
node scripts/build-index.mjs --check
node scripts/conformance.mjs
```

`add-listing.mjs` rebuilds `index.json` itself, so both files land in one
commit. If the diff touches anything beyond those four fields, the app's
`app.json` changed too — that's a manifest review (key scope, endpoints,
external hosts, capabilities), not a routine bump.

## Docs-drift: no doc PR for version bumps

`check-docs-drift.mjs` only asserts that each active listing's **name or slug**
appears in the three catalog docs — it never looks at versions. So a version
bump needs no doc PR. New listings and yanks do; see README step 4, and note
the check reads each doc repo's `main`, so those PRs merge first or alongside.

Local run against unpushed doc checkouts:

```bash
CORTEX_APP_DIR=~/coding/cortex-app CORTEX_SKILLS_DIR=~/coding/cortex-skills \
  node scripts/check-docs-drift.mjs
```

## Never do

- **Never replace an asset under an existing tag.** The pinned digest is the
  trust anchor; re-tagging silently invalidates every instance's verification.
  Ship a new version instead.
- **Never delete a listing.** Set `"status": "yanked"` + `yankedReason` via PR.
- **Never hand-edit `index.json`.** It's generated; `build-index.mjs --check`
  fails the PR if it drifts from `apps/*/listing.json`.
