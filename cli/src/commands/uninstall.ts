import * as p from '@clack/prompts';
import pc from 'picocolors';
import { join } from 'node:path';
import { readManifest, removeManifest } from '../manifest.js';
import { agents } from '../agents/registry.js';
import { uninstallClaudeCodeExtras } from '../agents/claude-code.js';
import { removeDir } from '../utils.js';
import { getVersion } from '../version.js';

export async function uninstall(): Promise<void> {
  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} uninstall`);

  const manifest = readManifest();
  if (!manifest) {
    p.log.warn('No OpenTIL installation found.');
    p.outro('Nothing to do');
    return;
  }

  const agentIds = Object.keys(manifest.agents);
  p.log.info(
    `Currently installed for: ${agentIds.map((id) => agents[id]?.displayName ?? id).join(', ')}`
  );

  const confirm = await p.confirm({
    message: 'Remove TIL skill from all agents?',
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Uninstall cancelled.');
    return;
  }

  const s = p.spinner();

  for (const agentId of agentIds) {
    const config = agents[agentId];
    if (!config) continue;

    s.start(`Removing TIL from ${config.displayName}...`);

    // Remove skill files
    removeDir(join(config.globalSkillDir, 'til'));

    // Remove extras
    if (agentId === 'claude-code') {
      uninstallClaudeCodeExtras();
    }

    s.stop(`${config.displayName}: removed`);
  }

  removeManifest();
  p.outro('OpenTIL has been uninstalled. See you next time!');
}
