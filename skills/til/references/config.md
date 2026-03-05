# Publishing Preferences Reference

## Preferences Cache Protocol

Skill and MCP share the same preferences cache.

### Cache file

- **Path**: `~/.til/cache/preferences.json`
- **TTL**: 1 hour (3600000ms)
- **Profile-aware**: cache includes `profile` field; invalidate on profile switch

### Envelope

```json
{
  "profile": "personal",
  "expires_at": 1709654400000,
  "data": {
    "default_visibility": "public",
    "custom_instructions": "- Use casual tone\n- Never start with 'Note:'"
  }
}
```

### Read chain

1. Cache hit (file exists + not expired + profile matches) -> use cached data
2. `GET /site` -> extract `preferences` field from response -> write cache -> use
3. API fail -> use stale cache (if file exists, ignore expiry) -> use hardcoded defaults as last resort

### Hardcoded defaults (fallback)

```json
{
  "default_visibility": "public",
  "custom_instructions": null
}
```

### Invalidation triggers

- `/til config set` or `/til config reset` success
- Profile switch (`/til auth switch`)
- TTL expiry (1 hour)

## `/til config` Display Format

```
Publishing Preferences:

  Visibility:      Public

  Custom instructions:
    - Use casual tone
    - Never start with "Note:"

  Edit at: https://opentil.ai/dashboard/settings/publishing
```

- "Visibility" maps to `default_visibility`: capitalize first letter
- "Custom instructions" shows `custom_instructions` text, or omit the section entirely when null

## `/til config set` Keys

Note: The API uses different field formats for read vs write:
- **GET /site** returns flattened `preferences.default_visibility`
- **PATCH /site** accepts nested `preferences.defaults.visibility`

| Key | PATCH field | Valid values |
|-----|-----------|-------------|
| `visibility` | `preferences.defaults.visibility` | `public`, `unlisted`, `private` |
| `instructions` | `preferences.custom_instructions` | Free text (max 2000 chars), or empty to clear |

### PATCH request format

```bash
curl -X PATCH "https://opentil.ai/api/v1/site" \
  -H "Authorization: Bearer $OPENTIL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "defaults": { "visibility": "unlisted" },
      "custom_instructions": "Use casual tone"
    }
  }'
```

Only include the fields being changed -- the server merges with existing settings.

## `/til config reset`

```bash
curl -X PATCH "https://opentil.ai/api/v1/site" \
  -H "Authorization: Bearer $OPENTIL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "defaults": { "visibility": "public" },
      "custom_instructions": null
    }
  }'
```

## Preferences Application During Content Generation

When generating a TIL entry (Execution Flow step 1.5):

1. **visibility**: Use `default_visibility` as-is
2. **custom_instructions**: Append to Content Guidelines as additional rules. User instructions take precedence when conflicting with defaults.
