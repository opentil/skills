import * as p from '@clack/prompts';
import pc from 'picocolors';
import { join } from 'node:path';
import { getVersion, checkLatestVersion } from '../version.js';
import { readManifest, writeManifest, updateManifest } from '../manifest.js';
import { agents, type ExtraType } from '../agents/registry.js';
import { installSkillFiles } from '../skill-content.js';
import { installAgentMdSection } from '../agents/agent-md.js';
import { installClaudeCodeHooks } from '../agents/claude-code.js';
import { installMcpConfig } from '../mcp.js';
import { readExistingCredentials } from '../auth.js';
import { isJsonMode, jsonOutput, jsonError, type ParsedFlags } from '../json-mode.js';

export async function update(flags: ParsedFlags): Promise<void> {
  if (isJsonMode()) {
    return updateJson(flags);
  }
  return updateInteractive();
}

// ─── JSON mode: actually perform update ─────────────────────────────
// Note: JSON mode skips CLI version check intentionally.
// Callers (e.g. `/til update`) use `npx @opentil/cli@latest` which
// guarantees the latest CLI. Adding checkLatestVersion() here would
// introduce network latency and a failure point for automation.

async function updateJson(flags: ParsedFlags): Promise<void> {
  const manifest = readManifest();
  if (!manifest) {
    jsonError('No OpenTIL installation found. Run install first.', 'NOT_INSTALLED');
  }

  const version = getVersion();
  const oldVersion = manifest.version;

  // Determine which agents to update
  let agentIds: string[];
  if (flags.agent && flags.agent !== 'all') {
    if (!agents[flags.agent]) {
      jsonError(`Unknown agent: ${flags.agent}`, 'UNKNOWN_AGENT', {
        available: Object.keys(agents),
      });
    }
    if (!manifest.agents[flags.agent]) {
      jsonError(`Agent not installed: ${flags.agent}`, 'NOT_INSTALLED', {
        installed: Object.keys(manifest.agents),
      });
    }
    agentIds = [flags.agent];
  } else {
    agentIds = Object.keys(manifest.agents);
  }

  // Reinstall skill files for each agent
  const changes: string[] = [];
  const updatedManifest = updateManifest(manifest, version);

  for (const agentId of agentIds) {
    const config = agents[agentId];
    if (!config) continue;

    const skillDir = join(config.globalSkillDir, 'til');
    installSkillFiles(skillDir, { commandPrefix: config.commandPrefix });
    changes.push(`Updated skill files for ${config.displayName}`);

    // Reinstall extras
    const extras = manifest.agents[agentId]?.extras ?? [];
    reinstallExtras(agentId, config, extras);

    if (extras.length > 0) {
      changes.push(`Updated extras for ${config.displayName}`);
    }
  }

  // Sync MCP tokens if credentials available
  const creds = readExistingCredentials();
  if (creds) {
    for (const agentId of agentIds) {
      if (!manifest.agents[agentId]?.mcp) continue;
      const config = agents[agentId];
      if (!config?.mcpConfigPath) continue;
      installMcpConfig(config.mcpConfigPath, creds.token);
    }
  }

  writeManifest(updatedManifest);

  jsonOutput({
    updated: oldVersion !== version,
    from: oldVersion,
    to: version,
    agents: agentIds,
    changes,
  });
}

// ─── Interactive mode ───────────────────────────────────────────────

async function updateInteractive(): Promise<void> {
  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} update`);

  const version = getVersion();

  // Check manifest first — "not installed" is a more actionable root cause
  // than "CLI outdated" for users who haven't run install yet.
  const manifest = readManifest();
  if (!manifest) {
    p.outro(`No installation found. Run: ${pc.cyan('npx @opentil/cli install')}`);
    return;
  }

  const versionCheck = await checkLatestVersion();

  if (versionCheck?.isOutdated) {
    p.log.warn(`Update available: ${pc.dim(`v${versionCheck.current}`)} → ${pc.green(`v${versionCheck.latest}`)}`);
    p.log.info(`  Run: ${pc.cyan('npx @opentil/cli@latest install')}`);
    p.outro('Skill files were NOT updated — install the latest CLI first.');
    return;
  }

  p.log.info(`Version: v${version} ${pc.green('(latest)')}`);

  const agentIds = Object.keys(manifest.agents);
  const updatedManifest = updateManifest(manifest, version);

  p.log.message(`Found ${agentIds.length} installed agent${agentIds.length === 1 ? '' : 's'}: ${agentIds.map((id) => agents[id]?.displayName ?? id).join(', ')}`);

  for (const agentId of agentIds) {
    const config = agents[agentId];
    if (!config) continue;

    const skillDir = join(config.globalSkillDir, 'til');
    installSkillFiles(skillDir, { commandPrefix: config.commandPrefix });
    p.log.success(`Updated skill files for ${config.displayName}`);

    const extras = manifest.agents[agentId]?.extras ?? [];
    reinstallExtras(agentId, config, extras);
    if (extras.length > 0) {
      p.log.success(`Updated extras for ${config.displayName}`);
    }
  }

  // Sync MCP tokens if credentials available
  const creds = readExistingCredentials();
  if (creds) {
    for (const agentId of agentIds) {
      if (!manifest.agents[agentId]?.mcp) continue;
      const config = agents[agentId];
      if (!config?.mcpConfigPath) continue;
      installMcpConfig(config.mcpConfigPath, creds.token);
    }
  }

  writeManifest(updatedManifest);

  p.outro(`All skill files updated to v${version}.`);
}

// ─── Helpers ────────────────────────────────────────────────────────

function reinstallExtras(agentId: string, config: typeof agents[string], extras: ExtraType[]): void {
  if (extras.includes('agent-md') && config.agentMdPath) {
    installAgentMdSection(config.agentMdPath, config.commandPrefix);
  }
  if (agentId === 'claude-code' && extras.includes('hooks')) {
    installClaudeCodeHooks();
  }
}
