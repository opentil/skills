# Taxonomy Reference (Categories + Tags)

## Taxonomy Cache Protocol

Skill and MCP share the same taxonomy cache to avoid redundant API calls.

### Cache file

- **Path**: `~/.til/cache/taxonomy.json`
- **TTL**: 10 minutes
- **Format**:
  ```json
  {
    "expires_at": 1709654400000,
    "data": {
      "categories": [
        { "id": "123", "name": "Backend", "slug": "backend", "description": "Server-side topics", "entries_count": 12, "position": 0 }
      ],
      "tags": [
        { "id": "456", "name": "rails", "slug": "rails", "taggings_count": 8 }
      ]
    }
  }
  ```

### Read/write flow (Skill implementation)

```
1. Read ~/.til/cache/taxonomy.json
   → File exists + expires_at > now (ms) → use cached data ✅
   → Otherwise continue ↓
2. Call GET /api/v1/taxonomy (with token)
   → Returns { categories: [...], tags: [...] }
3. Write cache file:
   - mkdir -p ~/.til/cache/
   - Write JSON with expires_at = now + 600000 (10 min in ms)
4. Return data ✅

Failure handling:
- API call fails → try GET /api/v1/categories as fallback (tags will be empty)
- Fallback also fails → return expired cache data (if file exists) or empty
- Cache file corrupted/unreadable → ignore, request API
```

**Skill uses Bash for cache reads and curl for API calls:**
```bash
# Read cache
cat ~/.til/cache/taxonomy.json 2>/dev/null

# Write cache (use Write tool for the actual file write)
```

### Cache invalidation

| Trigger | Action |
|---------|--------|
| Entry created successfully (may have created new tags/categories) | Delete cache file |
| `/til categories --force` or `/til tags --force` | Delete cache file, then re-fetch |
| TTL expired (10 min) | Next read auto-refreshes |

## Category Matching (when creating entries)

When assigning a category during entry creation:

1. **Exact name match** → use that category
2. **Case-insensitive match** → use that category (preserving original casing)
3. **Slug match** → use that category
4. **No match** → suggest new category name in `category_name` field (server creates it)
5. **Fetch fails** → skip category, proceed without `category_name` (never block entry creation)

## Tag Matching (when creating entries)

When assigning tags during entry creation, match each tag name against cached tags:

1. **Exact name match** → use that tag's canonical name
2. **Case-insensitive match** → use that tag's canonical name
3. **Slug match** → use that tag's canonical name
4. **No match** → keep original name (server will find-or-create the tag)
5. **Fetch fails** → pass original names through (never block entry creation)

This prevents duplicate tags like "Rails" vs "rails" vs "RAILS" from being created.

## `/til categories`

List site categories. Requires token with `read:entries` scope.

**API call:** `GET /api/v1/taxonomy` (falls back to `GET /api/v1/categories`)

**Display format:**

```
Your categories (3):

  Name             Entries  Description
  Backend              12   Server-side topics
  Frontend              8   Client-side development
  DevOps                5   Infrastructure and deployment

  3 categories
```

**Multi-profile variant** (≥2 profiles):

```
Your categories (3):

  Account: @hong (personal)

  Name             Entries  Description
  Backend              12   Server-side topics
  ...

  3 categories
```

**`--force` flag:**
- `/til categories --force` → delete cache file, re-fetch from API
- Useful when categories were just created via the web dashboard

**Empty state:**
```
No categories yet. Create them at: https://opentil.ai/dashboard/categories
```

## `/til tags`

List site tags. Requires token with `read:entries` scope.

**API call:** `GET /api/v1/taxonomy` (uses cached data)

**Display format:**

```
Your tags (5):

  Name             Entries
  rails                12
  ruby                  8
  docker                5
  testing               3
  css                   2

  5 tags
```

**`--force` flag:**
- `/til tags --force` → delete cache file, re-fetch from API

**Empty state:**
```
No tags yet. Add tags when creating entries.
```
