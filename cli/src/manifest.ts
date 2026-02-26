import { join } from 'node:path';
import { home, readJsonFile, writeJsonFile, removeFile } from './utils.js';
import type { ExtraType } from './agents/registry.js';

export interface AgentManifest {
  skill: boolean;
  extras: ExtraType[];
  mcp?: boolean;
}

export interface Manifest {
  version: string;
  installedAt: string;
  updatedAt: string;
  agents: Record<string, AgentManifest>;
}

const MANIFEST_PATH = join(home, '.til', 'manifest.json');

export function readManifest(): Manifest | null {
  return readJsonFile<Manifest>(MANIFEST_PATH);
}

export function writeManifest(manifest: Manifest): void {
  writeJsonFile(MANIFEST_PATH, manifest);
}

export function removeManifest(): void {
  removeFile(MANIFEST_PATH);
}

export function createManifest(version: string): Manifest {
  const now = new Date().toISOString();
  return {
    version,
    installedAt: now,
    updatedAt: now,
    agents: {},
  };
}

export function updateManifest(manifest: Manifest, version: string): Manifest {
  return {
    ...manifest,
    version,
    updatedAt: new Date().toISOString(),
  };
}
