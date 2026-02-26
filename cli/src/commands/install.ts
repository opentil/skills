import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { detectAgents, cleanupInstallerDirs, type DetectedAgent } from '../agents/detect.js';
import { agents, type ExtraType } from '../agents/registry.js';
import { installSkillFiles } from '../skill-content.js';
import { installAgentMdSection, uninstallAgentMdSection } from '../agents/agent-md.js';
import { installClaudeCodeHooks, uninstallClaudeCodeHooks } from '../agents/claude-code.js';
import { installMcpConfig, uninstallMcpConfig } from '../mcp.js';
import { removeDir } from '../utils.js';
import { readManifest, writeManifest, createManifest, updateManifest, type Manifest } from '../manifest.js';
import { join } from 'node:path';
import { getVersion, checkLatestVersion } from '../version.js';
import { runAuthPhase } from '../auth.js';

const EXTRA_LABELS: Record<ExtraType, string> = {
  hooks: 'Hooks (auto-detection reminders)',
  'agent-md': 'Instructions file (TIL auto-detection section)',
};

// ─── Fast path detection ────────────────────────────────────────────

function shouldUseFastPath(
  manifest: Manifest | null,
  installedAgents: DetectedAgent[],
): boolean {
  if (!manifest) return false;
  const manifestAgentIds = Object.keys(manifest.agents);
  if (manifestAgentIds.length === 0) return false;

  const installedIds = new Set(installedAgents.map((a) => a.id));

  // All manifest agents must still be detected
  const allStillDetected = manifestAgentIds.every((id) => installedIds.has(id));
  if (!allStillDetected) return false;

  // No new agents beyond what's in the manifest
  const noNewAgents = installedAgents.every((a) => manifestAgentIds.includes(a.id));
  return noNewAgents;
}

// ─── Main install flow ──────────────────────────────────────────────

export async function install(): Promise<void> {
  const version = getVersion();

  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} v${version}`);

  // Phase 0: Pre-checks
  const versionCheck = await checkLatestVersion();
  if (versionCheck?.isOutdated) {
    p.log.warn(`Update available: ${pc.dim(`v${versionCheck.current}`)} → ${pc.green(`v${versionCheck.latest}`)}`);
    p.log.info(`  Run: ${pc.cyan('npx @opentil/cli@latest')}`);
  }

  // Clean up directories created by previous installer runs
  const cleanedDirs = cleanupInstallerDirs();
  if (cleanedDirs.length > 0) {
    p.log.info(`Cleaned up ${cleanedDirs.length} installer-created ${cleanedDirs.length === 1 ? 'directory' : 'directories'}`);
  }

  // Phase 1: Detect agents
  const detected = detectAgents();
  const installedAgents = detected.filter((a) => a.installed);

  if (installedAgents.length === 0) {
    p.log.warn('No supported AI agents detected.');
    p.log.info('Supported agents: ' + Object.values(agents).map((a) => a.displayName).join(', '));
    p.log.info('Install an agent first, then re-run this installer.');
    p.outro('Done');
    return;
  }

  p.log.info(
    `Detected: ${installedAgents.map((a) => pc.green(a.config.displayName)).join(', ')}`,
  );

  // Read existing manifest
  const existingManifest = readManifest();
  const fastPath = shouldUseFastPath(existingManifest, installedAgents);

  // Phase 2: Authentication (before agent selection)
  const authResult = await runAuthPhase({ fastPath });

  if (fastPath && existingManifest) {
    // ── Fast path: skip interactive selection, reuse manifest config ──
    return fastPathInstall(existingManifest, version, authResult, installedAgents);
  }

  // ── Interactive path ──────────────────────────────────────────────

  // Phase 3: Agent selection
  const agentSelection = await p.multiselect({
    message: 'Which agents should have the TIL skill?',
    options: installedAgents.map((a) => ({
      value: a.id,
      label: a.config.displayName,
      hint: a.config.extras.length > 0
        ? `+ ${a.config.extras.map((e) => EXTRA_LABELS[e].split(' (')[0]).join(', ')}`
        : undefined,
    })),
    initialValues: existingManifest
      ? Object.keys(existingManifest.agents).filter((id) => installedAgents.some((a) => a.id === id))
      : installedAgents.map((a) => a.id),
    required: true,
  });

  if (p.isCancel(agentSelection)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  const selectedAgentIds = agentSelection as string[];

  // Per-agent extras selection
  const agentExtras: Record<string, ExtraType[]> = {};

  for (const agentId of selectedAgentIds) {
    const config = agents[agentId];
    if (config.extras.length === 0) {
      agentExtras[agentId] = [];
      continue;
    }

    const existingExtras = existingManifest?.agents[agentId]?.extras ?? config.extras;

    const extras = await p.multiselect({
      message: `${config.displayName} extras:`,
      options: config.extras.map((e) => ({
        value: e,
        label: EXTRA_LABELS[e],
      })),
      initialValues: existingExtras,
      required: false,
    });

    if (p.isCancel(extras)) {
      p.cancel('Installation cancelled.');
      process.exit(0);
    }

    agentExtras[agentId] = extras as ExtraType[];
  }

  // Phase 4: Execute installation
  const s = p.spinner();

  // Build manifest
  const manifest: Manifest = existingManifest
    ? updateManifest(existingManifest, version)
    : createManifest(version);
  manifest.agents = {};

  // Determine agents to uninstall (were in manifest, no longer selected)
  const agentsToRemove = existingManifest
    ? Object.keys(existingManifest.agents).filter((id) => !selectedAgentIds.includes(id))
    : [];

  // Uninstall removed agents (with ghost suppression)
  for (const agentId of agentsToRemove) {
    const config = agents[agentId];
    if (!config) continue;
    const skillDir = join(config.globalSkillDir, 'til');
    // Ghost suppression: only show removal message if skill dir actually exists on disk
    if (existsSync(skillDir)) {
      s.start(`Removing TIL from ${config.displayName}...`);
      removeAgentSkill(agentId, config.globalSkillDir);
      s.stop(`${config.displayName} removed`);
    } else {
      // Silently clean up manifest entry — no disk presence, no message
      removeAgentSkill(agentId, config.globalSkillDir);
    }
  }

  // Install/update selected agents
  for (const agentId of selectedAgentIds) {
    const config = agents[agentId];
    const extras = agentExtras[agentId];

    s.start(`Installing TIL skill for ${config.displayName}...`);

    // Copy SKILL.md + references
    const skillDir = join(config.globalSkillDir, 'til');
    installSkillFiles(skillDir);

    // Install extras
    installAgentExtras(agentId, config, extras);

    manifest.agents[agentId] = {
      skill: true,
      extras,
    };

    const extrasLabel = extras.length > 0
      ? ` + ${extras.map((e) => EXTRA_LABELS[e].split(' (')[0]).join(', ')}`
      : '';
    s.stop(`${config.displayName}: skill${extrasLabel}`);
  }

  // MCP Server installation
  const mcpToken = authResult.token;
  const mcpCapableAgents = selectedAgentIds.filter((id) => agents[id].mcpConfigPath);

  if (mcpCapableAgents.length > 0) {
    const existingMcpAgents = existingManifest
      ? mcpCapableAgents.filter((id) => existingManifest.agents[id]?.mcp)
      : [];

    const mcpSelection = await p.multiselect({
      message: 'Enable MCP Server? (lets agents search your TIL knowledge base)',
      options: mcpCapableAgents.map((id) => ({
        value: id,
        label: agents[id].displayName,
      })),
      initialValues: existingMcpAgents.length > 0 ? existingMcpAgents : mcpCapableAgents,
      required: false,
    });

    if (!p.isCancel(mcpSelection)) {
      const selectedMcp = mcpSelection as string[];

      for (const agentId of mcpCapableAgents) {
        const config = agents[agentId];
        if (selectedMcp.includes(agentId)) {
          s.start(`Configuring MCP for ${config.displayName}...`);
          installMcpConfig(config.mcpConfigPath!, mcpToken);
          const transport = mcpToken ? 'HTTP' : 'stdio';
          manifest.agents[agentId].mcp = true;
          s.stop(`${config.displayName}: MCP configured (${transport})`);
        } else if (existingManifest?.agents[agentId]?.mcp) {
          // Previously had MCP, now deselected — remove it
          s.start(`Removing MCP from ${config.displayName}...`);
          uninstallMcpConfig(config.mcpConfigPath!);
          s.stop(`${config.displayName}: MCP removed`);
        }
      }
    }
  }

  // Write manifest
  writeManifest(manifest);

  // Summary
  showSummary(selectedAgentIds, manifest, authResult);
}

// ─── Fast path install ──────────────────────────────────────────────

async function fastPathInstall(
  existingManifest: Manifest,
  version: string,
  authResult: Awaited<ReturnType<typeof runAuthPhase>>,
  _installedAgents: DetectedAgent[],
): Promise<void> {
  const s = p.spinner();
  const selectedAgentIds = Object.keys(existingManifest.agents);
  const manifest = updateManifest(existingManifest, version);

  // Silently reinstall skill files (update content)
  s.start('Updating skill files...');
  for (const agentId of selectedAgentIds) {
    const config = agents[agentId];
    if (!config) continue;
    const skillDir = join(config.globalSkillDir, 'til');
    installSkillFiles(skillDir);

    // Reinstall extras
    const extras = existingManifest.agents[agentId]?.extras ?? [];
    installAgentExtras(agentId, config, extras);
  }
  s.stop(`Updated ${selectedAgentIds.length} agent${selectedAgentIds.length === 1 ? '' : 's'}`);

  // MCP token sync: silently update token in all mcp: true agents
  const mcpToken = authResult.token;
  const mcpAgents = selectedAgentIds.filter(
    (id) => existingManifest.agents[id]?.mcp && agents[id]?.mcpConfigPath,
  );

  if (mcpAgents.length > 0) {
    for (const agentId of mcpAgents) {
      const config = agents[agentId];
      installMcpConfig(config.mcpConfigPath!, mcpToken);
    }
    // Preserve mcp flag in manifest
    for (const agentId of mcpAgents) {
      manifest.agents[agentId] = {
        ...manifest.agents[agentId],
        mcp: true,
      };
    }
  }

  // Write manifest
  writeManifest(manifest);

  // Summary
  showSummary(selectedAgentIds, manifest, authResult);
}

// ─── Summary ────────────────────────────────────────────────────────

function showSummary(
  selectedAgentIds: string[],
  manifest: Manifest,
  authResult: Awaited<ReturnType<typeof runAuthPhase>>,
): void {
  const mcpAgents = selectedAgentIds.filter((id) => manifest.agents[id]?.mcp);
  const mcpLine = mcpAgents.length > 0
    ? `  MCP Server: ${mcpAgents.map((id) => agents[id].displayName).join(', ')}`
    : '';
  const mcpToolsLine = mcpAgents.length > 0
    ? '  MCP tools are ready — agents can search your TIL knowledge base'
    : '';

  if (authResult.authenticated) {
    p.note(
      [
        `Skill installed for: ${selectedAgentIds.map((id) => agents[id].displayName).join(', ')}`,
        mcpLine,
        `  Account: @${authResult.username}`,
        '',
        'Use /til in your agent to capture insights!',
        mcpToolsLine,
        '',
        `Re-run ${pc.cyan('npx @opentil/cli')} to modify your setup.`,
      ].filter(Boolean).join('\n'),
      'Setup complete',
    );
  } else {
    p.note(
      [
        `Skill installed for: ${selectedAgentIds.map((id) => agents[id].displayName).join(', ')}`,
        mcpLine,
        '',
        'Next steps:',
        '  1. Run /til auth in your agent to connect your account',
        '  2. Use /til in your agent to capture insights!',
        mcpToolsLine,
        '',
        `Re-run ${pc.cyan('npx @opentil/cli')} to modify your setup.`,
      ].filter(Boolean).join('\n'),
      'Setup complete',
    );
  }

  p.outro('Happy TIL-ing!');
}

// ─── Helpers ────────────────────────────────────────────────────────

function removeAgentSkill(agentId: string, globalSkillDir: string): void {
  const skillDir = join(globalSkillDir, 'til');
  removeDir(skillDir);

  const config = agents[agentId];

  if (config) {
    uninstallAgentExtras(agentId, config);
  }

  // Remove MCP config if present
  if (config?.mcpConfigPath) {
    uninstallMcpConfig(config.mcpConfigPath);
  }
}

// ─── Extras dispatch ─────────────────────────────────────────────────

function installAgentExtras(agentId: string, config: typeof agents[string], extras: ExtraType[]): void {
  if (extras.includes('agent-md') && config.agentMdPath) {
    installAgentMdSection(config.agentMdPath);
  }
  if (agentId === 'claude-code' && extras.includes('hooks')) {
    installClaudeCodeHooks();
  }
}

function uninstallAgentExtras(agentId: string, config: typeof agents[string]): void {
  if (config.agentMdPath) {
    uninstallAgentMdSection(config.agentMdPath);
  }
  if (agentId === 'claude-code') {
    uninstallClaudeCodeHooks();
  }
}
