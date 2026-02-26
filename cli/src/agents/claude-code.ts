import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { home, readJsonFile, writeJsonFile, removeFile } from '../utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveTemplate(name: string): string {
  const candidates = [
    join(__dirname, '..', '..', 'templates', name),     // from cli/src or cli/dist
    join(__dirname, '..', 'templates', name),            // fallback
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  throw new Error(`Template not found: ${name}`);
}

// --- Hooks ---

export function installClaudeCodeHooks(): void {
  const hooksPath = join(home, '.claude', 'hooks.json');
  const templateContent = resolveTemplate('hooks.json');
  const template = JSON.parse(templateContent) as { hooks: Record<string, unknown[]> };

  // Read existing hooks.json or create empty
  let existing = readJsonFile<{ hooks: Record<string, unknown[]> }>(hooksPath);
  if (!existing) {
    existing = { hooks: {} };
  }
  if (!existing.hooks) {
    existing.hooks = {};
  }

  // Merge each event type from template
  for (const [event, entries] of Object.entries(template.hooks)) {
    if (!existing.hooks[event]) {
      existing.hooks[event] = [];
    }

    for (const entry of entries as Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>) {
      const alreadyExists = (existing.hooks[event] as Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>).some(
        (e) => {
          // Match by matcher if present
          if (entry.matcher) return e.matcher === entry.matcher;
          // For entries without matcher, compare by hook commands
          const entryCmd = entry.hooks?.map((h) => h.command).join('|');
          const existCmd = e.hooks?.map((h) => h.command).join('|');
          return entryCmd === existCmd;
        }
      );
      if (!alreadyExists) {
        (existing.hooks[event] as unknown[]).push(entry);
      }
    }
  }

  writeJsonFile(hooksPath, existing);
}

export function uninstallClaudeCodeHooks(): void {
  const hooksPath = join(home, '.claude', 'hooks.json');
  const existing = readJsonFile<{ hooks: Record<string, unknown[]> }>(hooksPath);
  if (!existing?.hooks) return;

  // Remove entries that match our template's matcher patterns
  const templateContent = resolveTemplate('hooks.json');
  const template = JSON.parse(templateContent) as { hooks: Record<string, unknown[]> };

  for (const [event, templateEntries] of Object.entries(template.hooks)) {
    if (!existing.hooks[event]) continue;
    const tEntries = templateEntries as Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>;
    existing.hooks[event] = (existing.hooks[event] as Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>).filter(
      (e) => !tEntries.some((t) => {
        if (t.matcher) return e.matcher === t.matcher;
        const tCmd = t.hooks?.map((h) => h.command).join('|');
        const eCmd = e.hooks?.map((h) => h.command).join('|');
        return tCmd === eCmd;
      })
    );
    if (existing.hooks[event].length === 0) {
      delete existing.hooks[event];
    }
  }

  // If hooks is empty, remove the file
  if (Object.keys(existing.hooks).length === 0) {
    removeFile(hooksPath);
  } else {
    writeJsonFile(hooksPath, existing);
  }
}
