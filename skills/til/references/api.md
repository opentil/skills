# API Reference

Base URL: `https://opentil.ai/api/v1`

All requests require a Bearer token:

```
Authorization: Bearer $OPENTIL_TOKEN
```

## POST /entries -- Create Entry

### Request Body

All fields are nested under `entry`. Additionally, `tag_names` and `category_name` are accepted at the `entry` level as convenience parameters.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Markdown body (max 100,000 chars) |
| `title` | string | no | Entry title (max 200 chars). Auto-generates slug if omitted. |
| `slug` | string | no | Custom URL slug. Auto-generated from title if omitted. |
| `tag_names` | array | no | 1-3 lowercase tags, e.g. `["go", "concurrency"]` |
| `category_name` | string | no | Category name. Only include if the user explicitly specifies one. |
| `category_id` | integer | no | Category ID (alternative to `category_name`). |
| `published` | boolean | no | `false` for draft (default), `true` to publish immediately. **Always use `false`.** |
| `published_at` | datetime | no | ISO 8601 timestamp. Only relevant when publishing. |
| `visibility` | string | no | `public` (default), `unlisted`, or `private` |
| `meta_description` | string | no | SEO meta description |
| `meta_image` | string | no | URL for social sharing image |
| `lang` | string | no | Language code (see Supported Languages below) |

### Supported Languages

`en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `pt`, `ru`, `ar`, `bs`, `da`, `nb`, `pl`, `th`, `tr`, `it`

### 201 Response

```json
{
  "id": "1234567890",
  "title": "Go interfaces are satisfied implicitly",
  "slug": "go-interfaces-are-satisfied-implicitly",
  "content": "In Go, a type implements an interface...",
  "content_html": "<p>In Go, a type implements an interface...</p>",
  "published": false,
  "published_at": null,
  "tag_names": ["go", "interfaces"],
  "lang": "en",
  "url": "https://opentil.ai/@username/go-interfaces-are-satisfied-implicitly",
  "created_at": "2026-02-10T14:30:22Z",
  "updated_at": "2026-02-10T14:30:22Z"
}
```

Use the `url` field for the Review link in result messages.

## GET /entries

List entries for the authenticated user.

```
GET /entries?status=published&per_page=20
```

| Param | Description |
|-------|-------------|
| `status` | `published`, `draft`, or `scheduled` |
| `tag` | Filter by tag slug |
| `per_page` | Results per page (max 100, default 20) |
| `page` | Page number |

## GET /entries/drafts

Shorthand for listing draft entries.

## POST /entries/:id/publish

Publish a draft entry. No request body needed.

## Error Handling

### Error Response Format

```json
{
  "error": {
    "type": "validation_error",
    "code": "validation_failed",
    "message": "Validation failed",
    "details": [{"field": "title", "message": "Title can't be blank"}]
  }
}
```

### Error Codes

| Status | Code | Action |
|--------|------|--------|
| 401 | `unauthorized` | Token invalid or expired. Save locally. Show regenerate link. |
| 401 | `insufficient_scope` | Token lacks `write:entries` scope. Save locally. |
| 422 | `validation_failed` | Parse `details` array, auto-fix, and retry once. Save locally if retry fails. |
| 429 | `rate_limited` | Rate limit exceeded. Save locally. Retry after `X-RateLimit-Reset`. |
| 5xx | -- | Server error. Save locally. |

### 422 Auto-Fix Retry Logic

When a 422 is returned, inspect the `details` array and attempt to fix:

1. `title` too long -> truncate to 200 chars
2. `lang` invalid -> fall back to `en`
3. `slug` already taken -> append `-2` (or increment)
4. `tag_names` invalid -> remove offending tags, keep valid ones
5. `content` too long -> truncate to 100,000 chars

After fixing, retry the POST **once**. If the retry also returns 422, save locally and report the error.

## Rate Limits

- Authenticated: 5,000 requests/hour
- Unauthenticated: 60 requests/hour

Rate limit info is returned in response headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

When `429` is received, save the draft locally and inform the user. Do not retry automatically -- the user's workflow should not be blocked by rate limits.
