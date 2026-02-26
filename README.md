# opentil/skills

Skills for [OpenTIL](https://opentil.ai) -- capture and manage TIL (Today I Learned) entries from your coding sessions.

## Install

```
npx @opentil/cli@latest
```

Detects your installed AI agents (Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Antigravity) and installs the TIL skill with per-agent extras. Works on macOS, Linux, and Windows.

## MCP Server

OpenTIL provides a remote MCP endpoint -- your AI agent connects directly via HTTP, no extra installation needed.

### Remote HTTP (Recommended)

**Claude Code:**

```bash
claude mcp add --transport http opentil https://opentil.ai/mcp \
  --header "Authorization: Bearer til_xxx"
```

**Cursor / VS Code** (`mcp.json`):

```json
{
  "mcpServers": {
    "opentil": {
      "type": "http",
      "url": "https://opentil.ai/mcp",
      "headers": {
        "Authorization": "Bearer til_xxx"
      }
    }
  }
}
```

### Local stdio (Alternative)

If you prefer running MCP locally (offline use or agents that don't support HTTP transport):

```bash
claude mcp add opentil -- npx -y @opentil/mcp
export OPENTIL_TOKEN="til_xxx"
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_profile` | User profile, top tags, entry count |
| `get_recent_learnings` | Recent published entries |
| `search_knowledge` | Full-text search across entries |
| `get_entry` | Full content of a specific entry |
| `create_til` | Create a new TIL entry |

## Commands

| Command | Description |
|---------|-------------|
| `npx @opentil/cli` | Interactive install / reconfigure |
| `npx @opentil/cli update` | Check for new versions |
| `npx @opentil/cli doctor` | Health check (includes version check) |
| `npx @opentil/cli uninstall` | Clean removal |

## Available Skills

### til

Capture and manage TIL entries on OpenTIL -- from drafting to publishing, all within the CLI.

- `/til <content>` -- capture a specific insight
- `/til` -- extract the best insight from the current conversation
- `/til list` / `/til search <keyword>` -- browse and search entries
- `/til publish last` -- publish the entry you just created
- `/til edit <id>` / `/til delete <id>` -- edit or delete entries
- **Auto-detection** -- the agent proactively suggests TIL-worthy moments

### Setup

1. Create a token at https://opentil.ai/dashboard/settings/tokens
2. Select scopes based on your needs:
   - `write:entries` -- create drafts (minimum for `/til <content>`)
   - `read:entries` -- list, search (`/til list`, `/til search`)
   - `delete:entries` -- delete (`/til delete`)
3. Set the environment variable: `export OPENTIL_TOKEN="til_xxx"`

See [skills/til/SKILL.md](skills/til/SKILL.md) for full documentation.

## License

MIT
