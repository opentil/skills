import * as p from '@clack/prompts';
import pc from 'picocolors';
import { detectAgents, type DetectedAgent } from '../agents/detect.js';
import { agents, type ExtraType } from '../agents/registry.js';
import { installSkillFiles } from '../skill-content.js';
import { installClaudeCodeExtras, uninstallClaudeCodeExtras } from '../agents/claude-code.js';
import { installMcpConfig, uninstallMcpConfig } from '../mcp.js';
import { removeDir } from '../utils.js';
import { readManifest, writeManifest, createManifest, updateManifest, type Manifest } from '../manifest.js';
import { join } from 'node:path';
import { getVersion, checkLatestVersion } from '../version.js';
import { runAuthPhase, readExistingCredentials, validateToken } from '../auth.js';

const EXTRA_LABELS: Record<ExtraType, string> = {
  hooks: 'Hooks (auto-detection reminders)',
  'claude-md': 'CLAUDE.md (TIL auto-detection section)',
};

export async function install(): Promise<void> {
  const version = getVersion();

  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} v${version}`);

  const versionCheck = await checkLatestVersion();
  if (versionCheck?.isOutdated) {
    p.log.warn(`Update available: ${pc.dim(`v${versionCheck.current}`)} → ${pc.green(`v${versionCheck.latest}`)}`);
    p.log.info(`  Run: ${pc.cyan('npx @opentil/cli@latest')}`);
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
    `Detected: ${installedAgents.map((a) => pc.green(a.config.displayName)).join(', ')}`
  );

  // Read existing manifest for pre-selection
  const existingManifest = readManifest();

  // Phase 1: Select agents
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
      ? Object.keys(existingManifest.agents)
      : installedAgents.map((a) => a.id),
    required: true,
  });

  if (p.isCancel(agentSelection)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  const selectedAgentIds = agentSelection as string[];

  // Phase 1: Per-agent extras selection
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

  // Phase 2: Execute installation
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

  // Uninstall removed agents
  for (const agentId of agentsToRemove) {
    const config = agents[agentId];
    if (!config) continue;
    s.start(`Removing TIL from ${config.displayName}...`);
    removeAgentSkill(agentId, config.globalSkillDir);
    s.stop(`${config.displayName} removed`);
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
    if (agentId === 'claude-code') {
      installClaudeCodeExtras(extras);
    }

    manifest.agents[agentId] = {
      skill: true,
      extras,
    };

    const extrasLabel = extras.length > 0
      ? ` + ${extras.map((e) => EXTRA_LABELS[e].split(' (')[0]).join(', ')}`
      : '';
    s.stop(`${config.displayName}: skill${extrasLabel}`);
  }

  // Phase 3: Authentication (before MCP, so we have a token for HTTP transport)
  const authResult = await runAuthPhase();

  // Resolve token for MCP HTTP transport
  let mcpToken: string | undefined;
  if (authResult.authenticated) {
    const creds = readExistingCredentials();
    if (creds) {
      const username = await validateToken(creds.token, creds.host);
      if (username) mcpToken = creds.token;
    }
  }

  // Phase 4: MCP Server installation
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
      'Setup complete'
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
      'Setup complete'
    );
  }

  p.outro('Happy TIL-ing!');
}

function removeAgentSkill(agentId: string, globalSkillDir: string): void {
  const skillDir = join(globalSkillDir, 'til');
  removeDir(skillDir);

  if (agentId === 'claude-code') {
    uninstallClaudeCodeExtras();
  }

  // Remove MCP config if present
  const config = agents[agentId];
  if (config?.mcpConfigPath) {
    uninstallMcpConfig(config.mcpConfigPath);
  }
}
