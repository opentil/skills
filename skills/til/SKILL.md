---
name: til
description: >
  Capture TIL (Today I Learned) entries and publish as drafts to OpenTIL.
  Use /til <content> to capture explicitly, /til to extract the best insight
  from conversation, or detect TIL-worthy moments proactively during work.
homepage: https://opentil.ai
license: MIT
metadata:
  author: opentil
  version: "1.0.0"
  primaryEnv: OPENTIL_TOKEN
---

# til

Capture "Today I Learned" entries from conversations and save them as drafts to OpenTIL.

## Setup

1. Go to https://opentil.ai/dashboard/tokens and create a Personal Access Token with `write:entries` scope
2. Copy the token (starts with `til_`)
3. Set the environment variable:

```bash
export OPENTIL_TOKEN="til_xxx"
```

## API Quick Reference

**Create a draft entry:**

```bash
curl -X POST "https://opentil.ai/api/v1/entries" \
  -H "Authorization: Bearer $OPENTIL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": {
      "title": "Go interfaces are satisfied implicitly",
      "content": "In Go, a type implements an interface...",
      "tag_names": ["go", "interfaces"],
      "published": false,
      "lang": "en"
    }
  }'
```

**Key parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Markdown body (max 100,000 chars) |
| `title` | string | no | Entry title (max 200 chars). Auto-generates slug. |
| `tag_names` | array | no | 1-3 lowercase tags, e.g. `["go", "concurrency"]` |
| `published` | boolean | no | `false` for draft (default), `true` to publish immediately |
| `lang` | string | no | Language code: `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, etc. |
| `slug` | string | no | Custom URL slug. Auto-generated from title if omitted. |
| `visibility` | string | no | `public` (default), `unlisted`, or `private` |

> Full parameter list, response format, and error handling: see [references/api.md](references/api.md)

## Execution Flow

Every `/til` invocation follows this flow:

1. **Generate** -- craft the TIL entry (title, body, tags, lang)
2. **Check token** -- is `$OPENTIL_TOKEN` set?
   - **Yes** -> POST to API with `published: false` -> show confirmation with Review link
   - **No** -> save to `~/.til/drafts/` -> show first-run setup guide
3. **Never lose content** -- the entry is always persisted somewhere

All entries are always created as drafts (`published: false`). The user reviews and publishes on OpenTIL.

## `/til <content>` -- Explicit Capture

The user's input is **raw material** -- a seed, not the final entry. Generate a complete TIL from it:

- Short input (a sentence or phrase) -> expand into a full entry with context and examples
- Long input (a paragraph or more) -> refine and structure, but preserve the user's intent

**Steps:**

1. Treat the user's input as a seed -- craft a complete title + body from it
2. Generate a concise title (5-15 words) in the same language as the content
3. Write a self-contained Markdown body (see Content Guidelines below)
4. Infer 1-3 lowercase tags from technical domain (e.g. `rails`, `postgresql`, `go`)
5. Detect language -> set `lang` (`en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `pt`, `ru`, `ar`, `bs`, `da`, `nb`, `pl`, `th`, `tr`, `it`)
6. Follow Execution Flow above (check token -> POST or save locally)

No confirmation needed -- the user explicitly asked to capture. Execute directly.

## `/til` -- Extract from Conversation

When `/til` is used without arguments, analyze the current conversation for learnable insights.

**Steps:**

1. Scan the conversation for knowledge worth preserving -- surprising facts, useful techniques, debugging breakthroughs, "aha" moments
2. Pick the single most valuable insight
3. Synthesize a standalone TIL entry (see Content Guidelines below)
4. **Show the generated entry to the user and ask for confirmation before proceeding** -- the user must approve what gets captured, since the AI chose the topic
5. On confirmation -> follow Execution Flow above (check token -> POST or save locally)

## Auto-Detection

When working alongside a user, proactively detect moments worth capturing as TIL entries.

### Trigger Conditions

**Class A (High signal):**
- Debugging uncovered a non-obvious root cause
- Discovered a language/framework behavior that contradicts common assumptions

**Class B (Medium signal):**
- Refactoring revealed a clearly superior pattern
- Performance optimization yielded a measurable improvement
- Found an obscure but highly useful tool flag or API parameter

**Class C (Low signal):**
- Two technologies interacting produced unexpected behavior
- Upgrade/migration surfaced a breaking change worth documenting

### Rate Limiting (Anti-Annoyance)

1. **Maximum 1 suggestion per session** -- after suggesting once, do not suggest again regardless of outcome
2. **Natural pauses only** -- never interrupt active problem-solving; suggest only at resolution points or between tasks
3. **Minimum conversation depth** -- at least 10 turns of conversation before first suggestion (Class A may trigger after 5 turns)
4. **Respect rejection** -- if the user declines, do not suggest again in this session

### Suggestion Format

When a TIL-worthy moment is detected, use this format:

```
I noticed something TIL-worthy: [one sentence summarizing the insight].
Want me to capture it? (You can also just say /til anytime.)
```

### Double Confirmation

Auto-detected TILs require two confirmations:

1. **First confirmation** -- User agrees the insight is worth capturing
2. **Second confirmation** -- Show the full generated draft (title, body, tags); user approves before API call

> Detailed trigger examples, state machine, and anti-patterns: see [references/auto-detection.md](references/auto-detection.md)

## Agent Identity

Three layers of attribution signal distinguish human-initiated from agent-initiated TILs.

### Layer 1: HTTP Headers

Include these headers on every API call:

```
X-OpenTIL-Source: human | agent
X-OpenTIL-Agent: <your agent display name>
X-OpenTIL-Model: <human-readable model name>
```

- Source: `/til <content>` and `/til` -> `human`; Auto-detected -> `agent`
- Agent: use your tool's display name (e.g. `Claude Code`, `Cursor`, `GitHub Copilot`). Do not use a slug.
- Model: use a human-readable model name (e.g. `Claude Opus 4.6`, `GPT-4o`, `Gemini 2.5 Pro`). Do not use a model ID.
- Agent and Model are optional -- omit them if you are unsure.

### Layer 2: Tag Convention

- Auto-detected TILs: automatically add `agent-assisted` to the tag list
- `/til <content>` and `/til`: do **not** add the tag (unless the Agent substantially rewrote the content)

### Layer 3: Attribution Rendering (Backend)

Agent-initiated TILs are visually marked on OpenTIL automatically based on the
`source` field. No content modification needed -- the backend renders attribution
in the display layer.

- Public page: shows `✨ via {agent_name}`, or `✨ AI` when agent_name is absent
- Tooltip (hover): shows `{agent_name} · {model}` when both are present
- Dashboard: shows ✨ badge + agent_name, or "Agent" when agent_name is absent

Do NOT append any footer or attribution text to the content body.

### Summary

| Dimension | `/til <content>` | `/til` | Auto-detected |
|-----------|-----------------|--------|---------------|
| Trigger | User explicit | User command | Agent proactive |
| Confirmations | 0 (direct) | 1 (draft) | 2 (suggest + draft) |
| Source header | `human` | `human` | `agent` |
| Agent header | Yes | Yes | Yes |
| Model header | Yes | Yes | Yes |
| `agent-assisted` tag | No | No | Yes |
| Attribution | Automatic (backend) | Automatic (backend) | Automatic (backend) |

## Content Guidelines

Every TIL entry must follow these rules:

- **Self-contained**: The reader must understand the entry without any conversation context. Never write "as we discussed", "the above error", "this project's config", etc.
- **One insight per entry**: Each TIL teaches exactly ONE thing. If there are multiple insights, create separate entries.
- **Concrete examples**: Include code snippets, commands, or specific data whenever relevant. Avoid vague descriptions.
- **Title**: 5-15 words. Descriptive, same language as content. No "TIL:" prefix.
- **Content**: Concise Markdown, 1-5 paragraphs. Focus on the insight, not the process of learning it.
- **Tags**: 1-3 lowercase tags from the technical domain (`go`, `rails`, `postgresql`, `css`, `linux`). No generic tags like `programming` or `til`.
- **Lang**: Detect from content. Chinese -> `zh-CN`, Traditional Chinese -> `zh-TW`, English -> `en`, Japanese -> `ja`, Korean -> `ko`.
- **Category**: Do not auto-infer `category_name` -- only include it if the user explicitly specifies a category/topic.

## Result Messages

### API Success (token configured, 201)

```
Draft saved to OpenTIL

  Title:  Go interfaces are satisfied implicitly
  Tags:   go, interfaces
  Review: https://opentil.ai/@username/go-interfaces-are-satisfied-implicitly
```

Extract the `url` field from the API response for the Review link.

### Sync Local Drafts

After the first successful API call, check `~/.til/drafts/` for pending files. If any exist, offer to sync:

```
Draft saved to OpenTIL

  Title:  Go interfaces are satisfied implicitly
  Tags:   go, interfaces
  Review: https://opentil.ai/@username/go-interfaces-are-satisfied-implicitly

Found 3 local drafts from before. Sync them to OpenTIL?
```

On confirmation, POST each draft to the API. Delete the local file after each successful sync. Keep files that fail. Show summary:

```
Synced 3 local drafts to OpenTIL

  + Go defer runs in LIFO order
  + PostgreSQL JSONB indexes support GIN operators
  + CSS :has() selector enables parent selection
```

If the user declines, keep the local files and do not ask again in this session.

### First Run (no token)

Save the draft locally, then show a warm setup guide. This is NOT an error -- the user successfully captured a TIL.

```
TIL captured

  Title:  Go interfaces are satisfied implicitly
  Tags:   go, interfaces
  File:   ~/.til/drafts/20260210-143022-go-interfaces.md

-- Connect to OpenTIL to sync your TILs --

  1. Get a token: https://opentil.ai/dashboard/tokens
     (select write:entries scope)
  2. Set the environment variable:
     export OPENTIL_TOKEN="til_xxx"

Your TILs will sync as drafts automatically.
```

Only show the full setup guide on the **first** local save in this session. On subsequent saves, use the short form:

```
TIL captured

  Title:  Go interfaces are satisfied implicitly
  Tags:   go, interfaces
  File:   ~/.til/drafts/20260210-143022-go-interfaces.md
```

## Error Handling

**On ANY API failure, always save the draft locally first.** Never let user content be lost.

**422 -- Validation error:** Analyze the error response, fix the issue (e.g. truncate title to 200 chars, correct lang code), and retry. Only save locally if the retry also fails.

**401 -- Token invalid or expired:**

```
TIL captured (saved locally -- token expired)

  File: ~/.til/drafts/20260210-143022-go-interfaces.md

Regenerate at: https://opentil.ai/dashboard/tokens
```

**Network failure or 5xx:**

```
TIL captured (saved locally -- API unavailable)

  File: ~/.til/drafts/20260210-143022-go-interfaces.md
```

> Full error codes, 422 auto-fix logic, and rate limit details: see [references/api.md](references/api.md)

## Local Draft Fallback

When the API is unavailable or no token is configured, drafts are saved locally to `~/.til/drafts/`.

**File format:** `YYYYMMDD-HHMMSS-<slug>.md`

```markdown
---
title: "Go interfaces are satisfied implicitly"
tags: [go, interfaces]
lang: en
---

In Go, a type implements an interface...
```

> Full directory structure, metadata fields, and sync protocol: see [references/local-drafts.md](references/local-drafts.md)

## Notes

- All entries are created as drafts (`published: false`) -- review and publish on OpenTIL
- The API auto-generates a URL slug from the title
- Tags are created automatically if they don't exist on the site
- Content is rendered to HTML server-side (Markdown with syntax highlighting)
