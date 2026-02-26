# @opentil/cli

Universal skill installer for [OpenTIL](https://opentil.ai) -- installs the TIL skill and MCP server config across 40+ AI agents.

## Install

```bash
npx @opentil/cli@latest
```

Detects your installed AI agents and interactively configures:

- **TIL skill** -- `/til` command for capturing and managing TIL entries
- **MCP server** -- connects your agent to your OpenTIL knowledge base
- **Agent extras** -- hooks, CLAUDE.md integration (Claude Code), MCP config (Cursor, Windsurf)

## Commands

```bash
npx @opentil/cli            # Interactive install / reconfigure
npx @opentil/cli update     # Check for new versions
npx @opentil/cli doctor     # Health check + version info
npx @opentil/cli uninstall  # Clean removal
```

## Supported Agents

Claude Code, Cursor, Windsurf, Codex, OpenCode, Gemini CLI, GitHub Copilot, Antigravity, Roo Code, Cline, Kilo Code, Goose, and [many more](https://github.com/opentil/opentil-skills/blob/main/cli/src/agents/registry.ts).

## What It Does

### Skill Installation

Copies the `/til` skill files to each agent's skill directory:

```
~/.claude/skills/til/       # Claude Code
~/.cursor/skills/til/       # Cursor
~/.codex/skills/til/        # Codex
...
```

### MCP Configuration

Configures MCP server in each agent's config file. Defaults to remote HTTP (zero-install):

```json
{
  "mcpServers": {
    "opentil": {
      "type": "http",
      "url": "https://opentil.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${OPENTIL_TOKEN}"
      }
    }
  }
}
```

### Claude Code Extras

- **Hooks** -- auto-detection reminder for TIL-worthy moments
- **CLAUDE.md** -- TIL guidelines injected into project instructions

## License

MIT
