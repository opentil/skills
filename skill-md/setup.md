# OpenTIL Setup Guide
<!-- opentil-skill-md version="1.33.0" -->

Connect your AI agent to [OpenTIL](https://opentil.ai) — capture what you learn, automatically.

**Language**: Always respond in the user's language. All instructions below are in English; adapt at runtime.

## Quick Setup

### For AI Agents (Headless Install)

Run this command to install the TIL skill (replace `claude-code` with your agent name):

```bash
npx @opentil/cli@latest install --agent claude-code --json
```

The command returns JSON with installation details (skill directory, MCP status, auth state).

**Available agents:**

| ID | Agent | Extras |
|----|-------|--------|
| `claude-code` | Claude Code | hooks, agent-md |
| `cursor` | Cursor | — |
| `windsurf` | Windsurf | — |
| `codex` | Codex | agent-md (prefix: `$til`) |
| `gemini-cli` | Gemini CLI | agent-md |
| `opencode` | OpenCode | agent-md |
| `roo` | Roo Code | — |
| `cline` | Cline | — |
| `continue` | Continue | — |
| `github-copilot` | GitHub Copilot | — |
| `goose` | Goose | — |
| `kilo` | Kilo Code | — |
| `openclaw` | OpenClaw | — |

The `--agent` value must be one of the IDs listed above. Use `--agent auto` to auto-detect all installed agents.

**To see which agents are installed on this machine:**

```bash
npx @opentil/cli@latest detect --json
```

> **Note:** After installation, restart your agent to load the new skill.
> For CLI-based agents (Claude Code, Codex, Gemini CLI), exit and relaunch.
> For IDE-based agents (Cursor, Windsurf, Cline, Roo, etc.), reload the window.

### Authentication

After installation, authenticate from within your agent:

```
/til auth
```

Or provide a token directly during install:

```bash
npx @opentil/cli@latest install --agent claude-code --token til_xxx --json
```

### For Humans (Interactive Install)

```bash
npx @opentil/cli@latest
```

The interactive installer will guide you through agent detection, authentication, and configuration.

## What Gets Installed

1. **SKILL.md** — Teaches your agent the `/til` command (capture, list, search, edit, publish, etc.)
2. **MCP Server** (optional) — Gives your agent read access to your published TILs for context
3. **Extras** (agent-specific):
   - **hooks** — Auto-detection reminders (Claude Code only)
   - **agent-md** — TIL section in your agent's instructions file

## Updating

The current skill version is embedded in this file (see the version comment at the top).

To check if an agent's installed skill is up to date, compare the local SKILL.md
version (in its YAML frontmatter `metadata.version`) with this file's version.
If the local version is lower, update with:

From within your agent:

```
/til update
```

Or from the command line:

```bash
npx @opentil/cli@latest update --json
```

## Health Check

```bash
npx @opentil/cli@latest doctor --json
```

Returns structured status of all installed agents, skill files, MCP configuration, and authentication.

## Manual Install (No Node.js)

The installer requires Node.js 18+. If you don't have it:

```bash
# macOS
brew install node

# Then run the installer
npx @opentil/cli@latest
```

## Verification

After setup, run in your agent:

```
/til status
```

You should see your connected account, site URL, and entry counts.

## Uninstalling

```bash
npx @opentil/cli@latest uninstall --json
```

## Learn More

- Site: https://opentil.ai
- Docs: https://opentil.ai/connect
- Dashboard: https://opentil.ai/dashboard
