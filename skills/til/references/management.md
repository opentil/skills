# Management Subcommands Reference

Detailed reference for TIL entry management via `/til` subcommands.

## Prerequisites

- **Token required**: All management subcommands require `$OPENTIL_TOKEN`. There is no local fallback — management operations are API-only.
- **No local fallback**: Unlike `/til <content>` which can save locally, management commands need live API access.
- **Missing token**: Show a clear error with the setup link:

```
Token required for /til <subcommand>.

Set up: https://opentil.ai/dashboard/settings/tokens
  → Create a token with read:entries, write:entries, delete:entries scopes
  → export OPENTIL_TOKEN="til_xxx"
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

## Error Handling

### Missing Token

```
Token required for /til <subcommand>.

Set up: https://opentil.ai/dashboard/settings/tokens
  → Create a token with read:entries, write:entries, delete:entries scopes
  → export OPENTIL_TOKEN="til_xxx"
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
