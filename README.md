# opentil/skills

Skills for [OpenTIL](https://opentil.ai) -- capture and manage TIL (Today I Learned) entries from your coding sessions.

## Install

```
npx @opentil/cli@latest
```

Detects your installed AI agents (Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Antigravity) and installs the TIL skill with per-agent extras. Works on macOS, Linux, and Windows.

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
