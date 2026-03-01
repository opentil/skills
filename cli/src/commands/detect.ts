import * as p from '@clack/prompts';
import pc from 'picocolors';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { detectAgents } from '../agents/detect.js';
import { agents } from '../agents/registry.js';
import { readManifest } from '../manifest.js';
import { isJsonMode, jsonOutput, type ParsedFlags } from '../json-mode.js';

export async function detect(_flags: ParsedFlags): Promise<void> {
  if (isJsonMode()) {
    return detectJson();
  }
  return detectInteractive();
}

function detectJson(): void {
  const detected = detectAgents();
  const installedAgents = detected.filter((a) => a.installed);
  const manifest = readManifest();

  const result = installedAgents.map((a) => {
    const config = agents[a.id];
    const manifestEntry = manifest?.agents[a.id];
    const skillDir = join(config.globalSkillDir, 'til');
    const hasSkill = existsSync(join(skillDir, 'SKILL.md'));

    return {
      id: a.id,
      name: config.displayName,
      installed: true,
      hasSkill,
      extras: manifestEntry?.extras ?? [],
      supportedExtras: config.extras,
      skillDir,
      mcpConfigPath: config.mcpConfigPath ?? null,
      mcp: manifestEntry?.mcp ?? false,
    };
  });

  jsonOutput({ agents: result });
}

function detectInteractive(): void {
  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} detect`);

  const detected = detectAgents();
  const installedAgents = detected.filter((a) => a.installed);
  const manifest = readManifest();

  if (installedAgents.length === 0) {
    p.log.warn('No supported AI agents detected.');
    p.outro('Done');
    return;
  }

  for (const a of installedAgents) {
    const config = agents[a.id];
    const manifestEntry = manifest?.agents[a.id];
    const skillDir = join(config.globalSkillDir, 'til');
    const hasSkill = existsSync(join(skillDir, 'SKILL.md'));
    const hasMcp = manifestEntry?.mcp ?? false;

    const status = hasSkill ? pc.green('✓ skill') : pc.dim('no skill');
    const mcpStatus = hasMcp ? pc.green('+ MCP') : '';
    const extras = manifestEntry?.extras?.length
      ? pc.dim(`(${manifestEntry.extras.join(', ')})`)
      : '';

    p.log.info(`  ${config.displayName}: ${status} ${mcpStatus} ${extras}`.trimEnd());
  }

  p.outro(`${installedAgents.length} agent${installedAgents.length === 1 ? '' : 's'} detected`);
}
