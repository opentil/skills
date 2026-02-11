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
source: human
agent_name: Claude Code
agent_model: Claude Opus 4.6
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
| `source` | string | `human` (from `/til`) or `agent` (from auto-detection) |
| `agent_name` | string | Agent display name, e.g. `Claude Code` (optional) |
| `agent_model` | string | Human-readable model name, e.g. `Claude Opus 4.6` (optional) |

The `source`, `agent_name`, and `agent_model` fields preserve attribution so that when syncing to the API, the correct headers and tags can be applied.

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

Wait for user confirmation. If the user declines, do not ask again this session.

### Step 3: Sync Each Draft

For each `.md` file in `~/.til/drafts/`:

1. Parse the frontmatter (title, tags, lang, source, agent_name, agent_model)
2. Read the content body (everything after the second `---`)
3. POST to API:
   - Set `published: false`
   - Set `X-OpenTIL-Source` header based on `source` field
   - Set `X-OpenTIL-Agent` header from `agent_name` field (if present)
   - Set `X-OpenTIL-Model` header from `agent_model` field (if present)
   - Add `agent-assisted` tag if `source` is `agent`
4. On 201 success: delete the local file
5. On failure: keep the local file, record the error

### Step 4: Report Results

**All succeeded:**
```
Synced 3 local drafts to OpenTIL

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
