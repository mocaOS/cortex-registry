# Reviewing a Listing PR

CI is the floor (schema, checksum, manifest≡zip, conformance); **human
review is the gate**. CI proves the listing is *honest* about what the app
declares — the reviewer judges whether what it declares is *justified*.
Work through this checklist; when in doubt, ask in the PR.

## The declaration review

1. **Key scope.** `read_write` needs a reason visible in the description
   ("syncs documents *into* Cortex" justifies it; a dashboard does not).
   Default expectation is `read`.
2. **Endpoint allowlist.** Every declared endpoint should map to a described
   feature. Flag anything broad (`admin/…` is never acceptable; `documents`
   + `upload` are normal for ingest apps; `ask`/`search` for query apps).
3. **External hosts** (`capabilities.http.hosts` and `externalHosts`).
   Each host must be explainable from the app's purpose. `${CONFIG_VAR}`
   refs are good (admin controls the target); literal hosts should be the
   service the app is *about*.
4. **Credential scoping.** An app declaring **more than one** http host must
   set `auth_host` on every `auth_header` config var — otherwise each
   credential is sent to all declared hosts. (The template validator warns;
   the reviewer enforces.)
5. **Capabilities.** `tasks`/`storage`/`llm` should each be traceable to a
   described feature. `llm` deserves a second look: those calls meter
   against the installing instance's quota.
6. **Sharing.** `sharing.links: true` is fine, but the description should
   make sense for logged-out visitors if it's set.

## The provenance review

7. **Repo matches artifact.** `repo` is the source of the release; the
   artifact URL lives under that repo's releases. Skim the source — the
   app's calls should match the manifest (CI proves manifest≡zip, not
   manifest≡behavior; for small apps a skim of `src/lib/` is enough).
8. **Version discipline.** New versions come as new tags + new zips. A PR
   that changes `artifact.sha256` without changing `app.version` is wrong
   by definition.
9. **Description honesty.** Name/description must not impersonate another
   project or overstate what the endpoints allow.

## Yanks

A yank PR (status → `yanked` + `yankedReason`) is merged fast — err on the
side of yanking; it's reversible. Never delete a listing.

## After merge

Nothing to do: `index.json` was rebuilt in the PR (CI checks staleness),
instances pick it up via `APP_REGISTRY_URL` within their cache window, and
the weekly scheduled run keeps re-verifying every artifact.
