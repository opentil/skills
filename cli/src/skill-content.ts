import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, writeTextFile } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveSkillDir(): string {
  const candidates = [
    // npm package: dist/../templates/skill/ (prebuild copies skills/til/ here)
    join(__dirname, '..', 'templates', 'skill'),
    // dev fallback: cli/src/../../skills/til/
    join(__dirname, '..', '..', 'skills', 'til'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error('Could not find skill content. Please report this issue.');
}

const DEFAULT_PREFIX = '/til';

function replaceCommandPrefix(content: string, prefix: string): string {
  // Replace /til when followed by a non-alphanumeric/underscore char or end of string.
  // This avoids replacing path segments like ~/.til/ (which is .til, not /til).
  return content.replace(/\/til(?=[^a-zA-Z0-9_]|$)/g, prefix);
}

export function installSkillFiles(targetDir: string, options?: { commandPrefix?: string }): void {
  const skillDir = resolveSkillDir();
  const prefix = options?.commandPrefix;
  const shouldReplace = prefix != null && prefix !== DEFAULT_PREFIX;

  const transform = (text: string) => shouldReplace ? replaceCommandPrefix(text, prefix) : text;

  // Copy SKILL.md
  const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
  ensureDir(targetDir);
  writeTextFile(join(targetDir, 'SKILL.md'), transform(skillMd));

  // Copy references/
  const refsDir = join(skillDir, 'references');
  if (existsSync(refsDir)) {
    const targetRefsDir = join(targetDir, 'references');
    ensureDir(targetRefsDir);
    for (const file of readdirSync(refsDir)) {
      const content = readFileSync(join(refsDir, file), 'utf-8');
      writeTextFile(join(targetRefsDir, file), transform(content));
    }
  }
}
