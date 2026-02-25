import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getVersion, checkLatestVersion } from '../version.js';

export async function update(): Promise<void> {
  p.intro(`${pc.bgCyan(pc.black(' OpenTIL '))} update`);

  const versionCheck = await checkLatestVersion();

  if (versionCheck?.isOutdated) {
    p.log.warn(`Update available: ${pc.dim(`v${versionCheck.current}`)} → ${pc.green(`v${versionCheck.latest}`)}`);
    p.log.info(`  Run: ${pc.cyan('npx @opentil/cli@latest')}`);
  } else {
    p.log.info(`Version: v${getVersion()} ${pc.green('(latest)')}`);
  }

  p.outro(versionCheck?.isOutdated ? 'Run the command above to update.' : 'You\'re up to date!');
}
