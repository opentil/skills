import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { agents, type AgentConfig } from './registry.js';
import { home, pruneEmptyParents } from '../utils.js';

export interface DetectedAgent {
  id: string;
  config: AgentConfig;
  installed: boolean;
}

/**
 * Check if a directory contains only installer-created content.
 * Returns true if the directory doesn't exist, is empty, or every entry
 * is either `skills` or another recursively installer-only directory.
 */
export function isInstallerOnlyDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) return true;
    return entries.every((entry) => {
      if (entry === 'skills') return true;
      const entryPath = join(dir, entry);
      try {
        const stat = statSync(entryPath);
        return stat.isDirectory() && isInstallerOnlyDir(entryPath);
      } catch {
        return false;
      }
    });
  } catch {
    return true;
  }
}

export function detectAgents(): DetectedAgent[] {
  return Object.entries(agents).map(([id, config]) => {
    if (!config.detect()) {
      return { id, config, installed: false };
    }

    // Determine which directories to check for installer-only content
    const dirs = config.detectDirs ?? [dirname(config.globalSkillDir)];

    // Empty detectDirs means skip the installer-only check (e.g. replit)
    if (dirs.length === 0) {
      return { id, config, installed: true };
    }

    // If ALL dirs are installer-only, this is a false positive
    const allInstallerOnly = dirs.every((dir) => isInstallerOnlyDir(dir));
    return { id, config, installed: !allInstallerOnly };
  });
}

/**
 * Remove directories that were created by the installer but contain no real agent content.
 * Returns the list of removed directory paths.
 */
export function cleanupInstallerDirs(): string[] {
  const cleaned: string[] = [];
  for (const config of Object.values(agents)) {
    const dirs = config.detectDirs ?? [dirname(config.globalSkillDir)];
    if (dirs.length === 0) continue;

    for (const dir of dirs) {
      if (existsSync(dir) && isInstallerOnlyDir(dir)) {
        rmSync(dir, { recursive: true, force: true });
        cleaned.push(dir);
        pruneEmptyParents(dirname(dir), home);
      }
    }
  }
  return cleaned;
}
