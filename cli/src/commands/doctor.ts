import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest } from '../manifest.js';
import { agents, type ExtraType } from '../agents/registry.js';
import { home, readJsonFile, readTextFile } from '../utils.js';
import { getVersion, checkLatestVersion } from '../version.js';

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export async function doctor(): Promise<void> {
  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} doctor`);

  const manifest = readManifest();
  if (!manifest) {
    p.log.warn('No OpenTIL installation found.');
    p.log.info(`Run ${pc.cyan('npx @opentil/cli')} to install.`);
    p.outro('Done');
    return;
  }

  const versionCheck = await checkLatestVersion();
  if (versionCheck?.isOutdated) {
    p.log.info(`Installed version: v${versionCheck.current}`);
    p.log.warn(`Latest version: ${pc.green(`v${versionCheck.latest}`)} — Run: ${pc.cyan('npx @opentil/cli@latest')}`);
  } else {
    p.log.info(`Version: v${getVersion()} ${pc.green('(latest)')}`);
  }

  const checks: CheckResult[] = [];

  if (versionCheck) {
    checks.push({
      label: 'CLI version',
      ok: !versionCheck.isOutdated,
      detail: versionCheck.isOutdated ? `v${versionCheck.current} → v${versionCheck.latest} available` : 'Up to date',
    });
  }

  // Check manifest agents
  for (const [agentId, agentManifest] of Object.entries(manifest.agents)) {
    const config = agents[agentId];
    if (!config) {
      checks.push({ label: `${agentId}: agent config`, ok: false, detail: 'Unknown agent' });
      continue;
    }

    // Check agent still installed
    checks.push({
      label: `${config.displayName}: detected`,
      ok: config.detect(),
      detail: config.detect() ? undefined : 'Agent not found on system',
    });

    // Check skill files
    const skillMdPath = join(config.globalSkillDir, 'til', 'SKILL.md');
    checks.push({
      label: `${config.displayName}: SKILL.md`,
      ok: existsSync(skillMdPath),
      detail: existsSync(skillMdPath) ? skillMdPath : 'Missing',
    });

    // Check extras
    for (const extra of agentManifest.extras) {
      const result = checkExtra(agentId, extra);
      checks.push(result);
    }
  }

  // Check token
  const hasToken = !!process.env.OPENTIL_TOKEN;
  const hasCredentials = existsSync(join(home, '.til', 'credentials'));
  checks.push({
    label: 'Token / credentials',
    ok: hasToken || hasCredentials,
    detail: hasToken
      ? 'OPENTIL_TOKEN set'
      : hasCredentials
        ? '~/.til/credentials found'
        : 'No token found. Set OPENTIL_TOKEN or run /til auth',
  });

  // Display results
  let allOk = true;
  for (const check of checks) {
    const icon = check.ok ? pc.green('✓') : pc.red('✗');
    const detail = check.detail ? pc.dim(` (${check.detail})`) : '';
    p.log.info(`  ${icon} ${check.label}${detail}`);
    if (!check.ok) allOk = false;
  }

  if (allOk) {
    p.outro(pc.green('All checks passed!'));
  } else {
    p.outro(pc.yellow('Some checks failed. Run npx @opentil/cli to fix.'));
  }
}

function checkExtra(agentId: string, extra: ExtraType): CheckResult {
  const config = agents[agentId];
  const label = `${config.displayName}: ${extra}`;

  switch (extra) {
    case 'hooks': {
      const hooksPath = join(home, '.claude', 'hooks.json');
      const hooks = readJsonFile<{ hooks: Record<string, unknown[]> }>(hooksPath);
      const hasOpentilHook = hooks?.hooks?.PostToolUse?.some(
        (h: unknown) => (h as { matcher?: string }).matcher?.includes('ExitPlanMode')
      ) || hooks?.hooks?.Stop?.some(
        (h: unknown) => {
          const entry = h as { hooks?: Array<{ command?: string }> };
          return entry.hooks?.some((hook) => hook.command?.includes('OpenTIL'));
        }
      );
      return { label, ok: !!hasOpentilHook, detail: hasOpentilHook ? undefined : 'Hook not found in hooks.json' };
    }
    case 'claude-md': {
      const claudeMdPath = join(home, '.claude', 'CLAUDE.md');
      const content = readTextFile(claudeMdPath);
      const hasSection = content?.includes('<!-- opentil:start -->');
      return { label, ok: !!hasSection, detail: hasSection ? undefined : 'Section not found in CLAUDE.md' };
    }
    default:
      return { label, ok: false, detail: `Unknown extra: ${extra} (re-run installer to fix)` };
  }
}
