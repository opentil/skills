# Local Drafts & Sync Protocol

When the API is unavailable or no token is configured, TIL entries are saved locally. This document covers the full local draft lifecycle.

## Directory Structure

```
~/.til/
  drafts/
    20260210-143022-go-interfaces.md
    20260210-150415-postgresql-gin-index.md
    20260211-091200-css-has-selector.md
```

All platforms use `~/.til/drafts/`. Create the directory if it does not exist.

## File Format

Filename: `YYYYMMDD-HHMMSS-<slug>.md`

The slug is derived from the title (lowercase, hyphens, no special chars, max 50 chars).

```markdown
---
title: "Go interfaces are satisfied implicitly"
tags: [go, interfaces]
lang: en
summary: "Go types implement interfaces implicitly by implementing their methods, with no explicit declaration needed."
source: human
agent_name: Claude Code
agent_model: Claude Opus 4.6
profile: personal
---

In Go, a type implements an interface by implementing its methods.
There is no explicit `implements` keyword...
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Entry title |
| `tags` | array | Tag list |
| `lang` | string | Language code |
| `summary` | string | AI-generated summary for listing pages (max 500 chars) |
| `source` | string | `human` (from `/til`) or `agent` (from auto-detection) |
| `agent_name` | string | Agent display name, e.g. `Claude Code` (optional) |
| `agent_model` | string | Human-readable model name, e.g. `Claude Opus 4.6` (optional) |
| `profile` | string | Active profile name at save time (optional). Used during sync to determine which account's token to use. Omitted when no profiles are configured. |
| `images` | array | Local image references (optional). Each entry: `{ local: "~/.til/drafts/images/slug-1.png", alt: "description" }` |

The `source`, `agent_name`, and `agent_model` fields preserve attribution so that when syncing to the API, the correct headers and tags can be applied.

The `profile` field ensures drafts are synced to the correct account in multi-profile setups.

The `images` field tracks local image files that need to be uploaded during sync. The markdown body references these images with local paths (e.g. `![alt](~/.til/drafts/images/slug-1.png)`) which are replaced with remote URLs after upload.

## Sync Protocol

When a successful API call is made (201 response), check for pending local drafts:

### Step 1: Detect Pending Drafts

```
List files in ~/.til/drafts/ matching *.md
```

If no files exist, skip sync entirely.

### Step 2: Offer to Sync

```
Found 3 local drafts from before. Sync them to OpenTIL?
```

**Multi-profile variant** (≥2 profiles):

```
Found 3 local drafts from before. Sync to @hong (personal)?
```

Wait for user confirmation. If the user declines, do not ask again this session.

### Step 2.5: Integrity Check

Before syncing, validate local draft consistency:

1. **Missing images**: For each draft with an `images` field, verify every `local` path exists on disk.
   - If a referenced image file is missing: warn the user, skip that draft.
   - Report: `Skipped: <title> — missing image: ~/.til/drafts/images/slug-1.png`
2. **Orphan images**: Scan `~/.til/drafts/images/` for files not referenced by any draft's `images` field or markdown body.
   - List orphans to the user: `Found 2 orphan images in ~/.til/drafts/images/. Remove? (y/n)`
   - On confirm: delete orphan files. On decline: leave them.
3. **Duplicate image refs**: If two drafts reference the same image file, warn but proceed — each sync will upload a separate copy.

This check runs once per sync invocation, before any uploads.

### Step 3: Sync Each Draft

For each `.md` file in `~/.til/drafts/`:

1. Parse the frontmatter (title, tags, lang, source, agent_name, agent_model, profile, images)
2. **Resolve token for this draft** (profile matching):
   - If `$OPENTIL_TOKEN` is set → always use it (env var overrides all profiles)
   - If `profile` field is present → look up that profile's token in `~/.til/credentials`
     - Profile found → use its token
     - Profile not found → skip this draft, report: `Skipped: profile "work" not found (/til auth list)`
   - If `profile` field is absent (old drafts) → use the current active profile's token
3. **Upload pending images** (if `images` field is present):
   - For each image in the `images` array:
     - Upload via `npx @opentil/cli image upload <local_path> --json`
     - On success: replace the local path in the markdown body **in memory only** (do not write back to draft file yet)
     - On failure: keep the local path, skip this draft, record the error
   - Do NOT delete image files yet — wait until the entry POST succeeds
4. Read the content body (everything after the second `---`, with image URLs substituted in memory)
5. POST to API (using the resolved token):
   - Set `published: false`
   - Set `X-OpenTIL-Source` header based on `source` field
   - Set `X-OpenTIL-Agent` header from `agent_name` field (if present)
   - Set `X-OpenTIL-Model` header from `agent_model` field (if present)
   - Add `agent-assisted` tag if `source` is `agent`
6. On 201 success: delete the local draft file AND its associated image files from `~/.til/drafts/images/`
7. On 409 (duplicate): treat as "already uploaded" — **delete the local draft file** and its images. Display as `= title (already exists)` in the report. Count toward successes, not failures.
8. On other failure: keep the local draft file and image files unchanged, record the error

### Step 4: Report Results

**All succeeded:**
```
Synced 3 local drafts to OpenTIL

  + Go defer runs in LIFO order
  + PostgreSQL JSONB indexes support GIN operators
  + CSS :has() selector enables parent selection
```

**Multi-profile variant** (≥2 profiles):
```
Synced 3 local drafts to OpenTIL

  Account: @hong (personal)
  + Go defer runs in LIFO order
  + PostgreSQL JSONB indexes support GIN operators
  + CSS :has() selector enables parent selection
```

**Partial failure:**
```
Synced 2 of 3 local drafts

  + Go defer runs in LIFO order
  + PostgreSQL JSONB indexes support GIN operators
  x CSS :has() selector enables parent selection (validation error)
    Kept at: ~/.til/drafts/20260210-143022-css-has-selector.md
```

## First-Run Guide Template

On the first local save in a session (when no token is found):

```
TIL captured

  Title:  Go interfaces are satisfied implicitly
  Tags:   go, interfaces
  File:   ~/.til/drafts/20260210-143022-go-interfaces.md

Sync to OpenTIL? Run: /til auth
```

On subsequent local saves in the same session, use the short form:

```
TIL captured

  Title:  Go interfaces are satisfied implicitly
  Tags:   go, interfaces
  File:   ~/.til/drafts/20260210-143022-go-interfaces.md
```

Track "first save shown" as session state. Reset on each new session.
