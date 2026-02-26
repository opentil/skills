# @opentil/mcp

Local MCP (Model Context Protocol) server for [OpenTIL](https://opentil.ai) -- lets AI agents search and create TIL entries via stdio transport.

> **Recommended**: Use OpenTIL's [remote MCP endpoint](https://opentil.ai/mcp) instead -- zero installation, just configure a URL. This package is for offline use or agents that don't support HTTP transport.

## Quick Start

```bash
# Claude Code
claude mcp add opentil -- npx -y @opentil/mcp

# Set your token
export OPENTIL_TOKEN="til_xxx"
```

Create a token at https://opentil.ai/dashboard/settings/tokens

## Remote MCP (Recommended)

No installation needed. Configure your agent to connect directly:

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

## Tools

| Tool | Description |
|------|-------------|
| `get_profile` | User profile, top tags, entry count |
| `get_recent_learnings` | Recent published entries |
| `search_knowledge` | Full-text search across entries |
| `get_entry` | Full content of a specific entry |
| `create_til` | Create a new TIL entry |

## Token Resolution

1. `$OPENTIL_TOKEN` environment variable
2. `~/.til/credentials` file (active profile, created by `/til auth`)

## License

MIT
