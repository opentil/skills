import * as p from '@clack/prompts';
import pc from 'picocolors';
import { join } from 'node:path';
import { readManifest, removeManifest, writeManifest } from '../manifest.js';
import { agents } from '../agents/registry.js';
import { uninstallAgentMdSection } from '../agents/agent-md.js';
import { uninstallClaudeCodeHooks } from '../agents/claude-code.js';
import { uninstallMcpConfig } from '../mcp.js';
import { removeDir, pruneEmptyParents, home } from '../utils.js';
import { getVersion } from '../version.js';
import { isJsonMode, jsonOutput, jsonError, type ParsedFlags } from '../json-mode.js';

export async function uninstall(flags: ParsedFlags): Promise<void> {
  if (isJsonMode()) {
    return uninstallJson(flags);
  }
  return uninstallInteractive();
}

// ─── JSON mode ──────────────────────────────────────────────────────

function uninstallJson(flags: ParsedFlags): void {
  const manifest = readManifest();
  if (!manifest) {
    jsonOutput({ success: true, message: 'No installation found' });
    return; // unreachable
  }

  // Determine which agents to uninstall
  let agentIds: string[];
  if (flags.agent && flags.agent !== 'all') {
    if (!manifest.agents[flags.agent]) {
      jsonError(`Agent not installed: ${flags.agent}`, 'NOT_INSTALLED', {
        installed: Object.keys(manifest.agents),
      });
    }
    agentIds = [flags.agent];
  } else {
    agentIds = Object.keys(manifest.agents);
  }

  const removed: string[] = [];

  for (const agentId of agentIds) {
    const config = agents[agentId];
    if (!config) continue;

    // Remove skill files
    removeDir(join(config.globalSkillDir, 'til'));
    pruneEmptyParents(config.globalSkillDir, home);

    // Remove extras
    const agentExtras = manifest.agents[agentId]?.extras ?? [];
    if (agentExtras.includes('agent-md') && config.agentMdPath) {
      uninstallAgentMdSection(config.agentMdPath);
    }
    if (agentId === 'claude-code' && agentExtras.includes('hooks')) {
      uninstallClaudeCodeHooks();
    }

    // Remove MCP config
    if (config.mcpConfigPath) {
      uninstallMcpConfig(config.mcpConfigPath);
    }

    removed.push(agentId);
  }

  // Update manifest: remove uninstalled agents or delete entirely
  const remainingAgents = Object.keys(manifest.agents).filter((id) => !agentIds.includes(id));
  if (remainingAgents.length === 0) {
    removeManifest();
  } else {
    for (const id of agentIds) {
      delete manifest.agents[id];
    }
    writeManifest(manifest);
  }

  jsonOutput({
    success: true,
    removed: removed.map((id) => ({
      id,
      name: agents[id]?.displayName ?? id,
    })),
  });
}

// ─── Interactive mode ───────────────────────────────────────────────

async function uninstallInteractive(): Promise<void> {
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
    // Prune empty parent directories left by the installer
    pruneEmptyParents(config.globalSkillDir, home);

    // Remove extras
    const agentExtras = manifest.agents[agentId]?.extras ?? [];
    if (agentExtras.includes('agent-md') && config.agentMdPath) {
      uninstallAgentMdSection(config.agentMdPath);
    }
    if (agentId === 'claude-code' && agentExtras.includes('hooks')) {
      uninstallClaudeCodeHooks();
    }

    // Remove MCP config
    if (config.mcpConfigPath) {
      uninstallMcpConfig(config.mcpConfigPath);
    }

    s.stop(`${config.displayName}: removed`);
  }

  removeManifest();
  p.outro('OpenTIL has been uninstalled. See you next time!');
}
