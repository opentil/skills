# opentil/skills

Skills for [OpenTIL](https://opentil.ai) -- capture and publish TIL (Today I Learned) entries from your coding sessions.

## Install

```bash
npx skills add opentil/skills@til
```

## Available Skills

### til

Capture TIL entries as drafts to OpenTIL.

- `/til <content>` -- capture a specific insight
- `/til` -- extract the best insight from the current conversation
- **Auto-detection** -- the agent proactively suggests TIL-worthy moments

### Setup

1. Create a token at https://opentil.ai/dashboard/settings/tokens (select `write:entries` scope)
2. Set the environment variable: `export OPENTIL_TOKEN="til_xxx"`

See [skills/til/SKILL.md](skills/til/SKILL.md) for full documentation.

## License

MIT
