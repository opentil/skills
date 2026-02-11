# Management Subcommands Reference

Detailed reference for TIL entry management via `/til` subcommands.

## Prerequisites

- **Token required**: All management subcommands require a token (env var or `~/.til/credentials`), except `/til status` and `/til auth` which work without a token. There is no local fallback — management operations are API-only.
- **No local fallback**: Unlike `/til <content>` which can save locally, management commands need live API access.
- **Missing token**: Show a clear error (except for `status` and `auth`):

```
Token required. Run /til auth to connect.
```

## Scope Requirements

| Subcommand | Required Scope | API Calls |
|------------|---------------|-----------|
| `list` | `read:entries` | `GET /entries` |
| `search` | `read:entries` | `GET /entries?q=...` |
| `publish` | `write:entries` | `POST /entries/:id/publish` |
| `unpublish` | `write:entries` | `POST /entries/:id/unpublish` |
| `edit` | `read:entries` + `write:entries` | `GET /entries/:id` + `PATCH /entries/:id` |
| `delete` | `delete:entries` | `DELETE /entries/:id` |
| `status` | `read:entries` (optional) | `GET /site` |
| `sync` | `write:entries` | `POST /entries` (per draft) |
| `tags` | `read:entries` | `GET /tags?sort=popular` |
| `categories` | `read:entries` | `GET /categories` |
| `batch` | `write:entries` | `POST /entries` (per topic) |

When a 403 `insufficient_scope` error is returned, map the subcommand to the needed scope:

```
Permission denied — your token needs the <scope> scope.

Regenerate at: https://opentil.ai/dashboard/settings/tokens
```

## ID Format and Resolution

### Display Format

In list/search output, show entry IDs in short form: `...` prefix + last 8 characters.

```
...a1b2c3d4  Draft  Go interfaces are satisfied implicitly
```

### Input Resolution

Users can provide short or full IDs. Resolve by suffix match:

1. If the input matches an entry ID exactly → use it
2. If the input is a suffix of exactly one entry ID from the current listing → use it
3. If the input matches multiple entries → ask the user to be more specific
4. If no match → return "Entry not found"

For `publish last` — resolve via session state (see below).

## Session State

Track `last_created_entry_id` in the current session:

- **Set** on every successful `POST /entries` (201 response) — capture the `id` from the response
- **Used by** `publish last` — resolves to this ID
- **Cleared** when session ends (not persisted across sessions)

If `publish last` is used but no entry was created in this session:

```
No entry created in this session. Use /til publish <id> instead.
```

## Subcommand Details

### `/til list [drafts|published|all]`

**Default filter**: `drafts` (most common use case — review and publish drafts).

**API call**: `GET /entries?status=<filter>&per_page=10`

- `drafts` → `status=draft`
- `published` → `status=published`
- `all` → omit `status` param

**Display format** (compact table):

```
Your drafts (3):

  ID            Status    Title
  ...a1b2c3d4   Draft     Go interfaces are satisfied implicitly
  ...e5f6g7h8   Draft     Ruby supports pattern matching
  ...i9j0k1l2   Draft     CSS :has() enables parent selection

  Page 1 of 1 · 3 entries
```

**Empty state**:

```
No drafts found. Create one with /til <content>.
```

For published:

```
No published entries found.
```

### `/til publish [<id> | last]`

**Resolution**:
- `last` → use `last_created_entry_id` from session state
- `<id>` → resolve via ID resolution algorithm

**Flow**:
1. `GET /entries/:id` — fetch the entry to show what will be published
2. Show confirmation:

```
Publish this entry?

  Title: Go interfaces are satisfied implicitly
  Tags:  go, interfaces

Confirm? (y/n)
```

3. On confirmation → `POST /entries/:id/publish`
4. Show result:

```
Published

  Title: Go interfaces are satisfied implicitly
  URL:   https://opentil.ai/@username/go-interfaces-are-satisfied-implicitly
```

**Already published**: Informational, not an error.

```
Already published.

  Title: Go interfaces are satisfied implicitly
  URL:   https://opentil.ai/@username/go-interfaces-are-satisfied-implicitly
```

### `/til unpublish <id>`

**Flow**:
1. `GET /entries/:id` — fetch the entry
2. Show confirmation:

```
Unpublish this entry? It will become a draft.

  Title: Go interfaces are satisfied implicitly
```

3. On confirmation → `POST /entries/:id/unpublish`
4. Show result:

```
Unpublished — entry is now a draft.

  Title: Go interfaces are satisfied implicitly
```

**Already a draft**: Informational, not an error.

```
Already a draft.

  Title: Go interfaces are satisfied implicitly
```

### `/til edit <id> [instructions]`

**Flow**:
1. `GET /entries/:id` — fetch the full entry
2. Apply AI-assisted changes based on instructions (or ask what to change if no instructions given)
3. Show diff preview:

```
Proposed changes to "Go interfaces are satisfied implicitly":

  Title: Go interfaces are satisfied implicitly (unchanged)

  Content diff:
  - In Go, a type implements an interface by implementing its methods.
  + In Go, a type satisfies an interface by implementing all of its methods.
  + No explicit "implements" declaration is needed.

  Tags: go, interfaces → go, interfaces, type-system

Apply changes?
```

4. On confirmation → `PATCH /entries/:id` with only the changed fields
5. Show result:

```
Updated

  Title: Go interfaces are satisfied implicitly
  URL:   https://opentil.ai/@username/go-interfaces-are-satisfied-implicitly
```

### `/til search <keyword>`

**API call**: `GET /entries?q=<keyword>&per_page=10`

**Display format**: Same compact table as `list`.

```
Search results for "go" (2):

  ID            Status      Title
  ...a1b2c3d4   Published   Go interfaces are satisfied implicitly
  ...i9j0k1l2   Draft       Go concurrency with goroutines

  2 entries found
```

**No results**:

```
No entries matching "go" found.
```

### `/til delete <id>`

**Flow**:
1. `GET /entries/:id` — fetch the entry
2. Double-confirm (this cannot be undone):

```
Delete this entry? This cannot be undone.

  Title: Go interfaces are satisfied implicitly
  Status: Draft

Type "delete" to confirm:
```

3. On confirmation → `DELETE /entries/:id`
4. Show result:

```
Deleted.

  Title: Go interfaces are satisfied implicitly
```

### `/til status`

Show site status and connection info. **Special: works without a token** (degraded display).

**With token** -- `GET /site`:

```
OpenTIL Status

  Site:     @hong (opentil.ai/@hong)
  Entries:  28 total (15 published, 13 drafts)
  Token:    til_...a3f2 ✓
  Local:    1 draft pending sync

  Manage: https://opentil.ai/dashboard
```

- `Site` line: `@username` + public URL
- `Entries` line: `entries_count` (total), `published_entries_count` (published), difference = drafts
- `Token` line: last 4 chars of the resolved token + `✓`
- `Local` line: count of `*.md` files in `~/.til/drafts/`
- `Manage` link: dashboard URL

**Without token:**

```
OpenTIL Status

  Site:     (not connected)
  Token:    not configured
  Local:    3 drafts pending sync

  Run /til auth to connect
```

**Token set but API error** (401, network failure):

```
OpenTIL Status

  Site:     (unable to connect)
  Token:    til_...a3f2 ✗
  Local:    0 drafts

  Check token: https://opentil.ai/dashboard/settings/tokens
```

### `/til auth`

Connect an OpenTIL account via Device Flow (browser-based authorization). **Works without a token.**

**Flow:**

1. **Check existing connection**
   - Resolve token (env var → `~/.til/credentials`)
   - If token found, `GET /site` to verify:
     - Valid: `"Already connected as @{username}. Re-authorize? (y/n)"`
       - `y` → continue to new authorization
       - `n` → end
     - Invalid (401) → continue to new authorization
   - If no token → continue to new authorization

2. **Create device code**
   - `POST /api/v1/oauth/device/code` with `{ "scopes": ["read", "write"] }`
   - Response: `{ device_code, user_code, verification_uri, expires_in, interval }`

3. **Open browser + display**
   - Open `{verification_uri}?user_code={user_code}` via `open` (macOS) or `xdg-open` (Linux)
   - Display:

```
Opening browser to connect...

If browser didn't open, visit:
  https://opentil.ai/device
Enter code: XXXX-YYYY

Waiting for authorization...
```

4. **Poll for token**
   - Use a bash script to poll in a single command (not multiple turns):
     - Every `{interval}` seconds, `POST /api/v1/oauth/device/token`
     - `authorization_pending` → continue polling
     - `slow_down` → increase interval by 5 seconds
     - `expired_token` → timeout
     - 200 → extract `access_token`
   - Hard timeout: 300 seconds (5 minutes)

5. **On success**
   - Create `~/.til/` directory if it doesn't exist
   - Write token to `~/.til/credentials` (plain text, `chmod 600`)
   - Display:

```
✓ Connected to OpenTIL
  Token saved to ~/.til/credentials
```

   - Check `~/.til/drafts/` for local drafts
   - If drafts exist: `"Found N local drafts. Sync now? (y/n)"`

6. **On timeout**

```
Authorization timed out. Run /til auth to try again.
```

7. **On network error**

```
Unable to reach OpenTIL. Check your connection and try again.
```

**Edge cases:**

| Scenario | Handling |
|----------|----------|
| Already has valid token | Confirm before re-authorizing |
| Token expired/invalid | Proceed directly to new authorization, no confirmation |
| `~/.til/` directory doesn't exist | Create automatically |
| Browser didn't open | Display fallback URL + manual code entry |
| User cancels in browser | Polling times out, show timeout message |
| Token obtained + local drafts exist | Offer to sync |

### `/til sync`

Explicitly sync local drafts from `~/.til/drafts/` to OpenTIL. Requires token.

**Flow:**

1. List `*.md` files in `~/.til/drafts/`
2. If no files: `No local drafts to sync.`
3. Show what will be synced and ask for confirmation:

```
Found 2 local drafts:

  1. go-interfaces.md
  2. rails-solid-queue.md

Sync to OpenTIL? (y/n)
```

4. On confirmation, for each file: parse frontmatter, POST to API (with correct attribution headers), delete local file on success
5. Show results:

**All synced:**

```
Synced 2 local drafts
  ✓ go-interfaces.md
  ✓ rails-solid-queue.md
```

**Partial failure:**
```
Synced 1 of 2 local drafts
  ✓ go-interfaces.md
  ✗ rails-solid-queue.md (validation error)
    Kept at: ~/.til/drafts/20260210-150415-rails-solid-queue.md
```

### `/til tags`

List site tags sorted by usage count. Requires token.

**API call:** `GET /tags?sort=popular&per_page=20&with_entries=true`

**Display format:**

```
Your tags (12):

  Tag               Entries
  go                      8
  postgresql              5
  rails                   4
  css                     3
  linux                   2
  ...

  Showing top 20 · 12 total tags
```

**Empty state:**
```
No tags yet. Tags are created automatically when you publish entries.
```

### `/til categories`

List site categories. Requires token.

**API call:** `GET /categories`

**Display format:**

```
Your categories (3):

  Name             Entries  Description
  Backend              12   Server-side topics
  Frontend              8   Client-side development
  DevOps                5   Infrastructure and deployment

  3 categories
```

**Empty state:**
```
No categories yet. Create them at: https://opentil.ai/dashboard/topics
```

### `/til batch <topics>`

Batch-capture multiple TIL entries in one invocation. Requires an explicit topic list (no implicit extraction — use `/til` without arguments for that).

**Input formats** -- user provides topics separated by newlines, semicolons, markdown list items (`-`), or numbered list (`1.`):

```
/til batch
- Go channels block when buffer is full
- CSS grid fr unit distributes remaining space
- PostgreSQL EXPLAIN ANALYZE shows actual vs estimated rows
```

**Flow:**

1. Parse the input into separate topics
2. For each topic, generate a complete TIL entry (title, body, tags, lang)
3. Show all drafts as a numbered list for review:

```
Generated 3 drafts:

  1. Go channels block when buffer is full
     Tags: go, concurrency
  2. CSS grid fr unit distributes remaining space
     Tags: css, grid
  3. PostgreSQL EXPLAIN ANALYZE shows actual vs estimated rows
     Tags: postgresql, performance

Which to send? (1/2/3/all/none)
```

4. On confirmation, POST each selected entry sequentially
5. Show summary:

```
Captured 3 TILs

  ✓ Go channels block when buffer is full
  ✓ CSS grid fr unit distributes remaining space
  ✓ PostgreSQL EXPLAIN ANALYZE shows actual vs estimated rows
```

**Partial failure:**

```
Captured 2 of 3 TILs

  ✓ Go channels block when buffer is full
  ✗ CSS grid fr unit distributes remaining space (validation error)
  ✓ PostgreSQL EXPLAIN ANALYZE shows actual vs estimated rows
```

Failed entries are saved locally to `~/.til/drafts/` (same as normal capture fallback).

## Error Handling

### Missing Token

```
Token required. Run /til auth to connect.
```

### Insufficient Scope (403)

```
Permission denied — your token needs the <scope> scope.

Regenerate at: https://opentil.ai/dashboard/settings/tokens
```

### Entry Not Found (404)

```
Entry not found: <id>

Use /til list to see your entries.
```

### Already in Target State

Not errors — show informational message (see publish/unpublish sections above).

### Network Errors

```
API unavailable. Try again later.
```

Management subcommands do not have a local fallback — they require API access.
