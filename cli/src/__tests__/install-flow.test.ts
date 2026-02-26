import { describe, it, expect } from 'vitest';
import { shouldUseFastPath } from '../commands/install.js';
import type { Manifest } from '../manifest.js';
import type { DetectedAgent } from '../agents/detect.js';

function makeAgent(id: string, installed = true): DetectedAgent {
  return {
    id,
    config: {
      name: id,
      displayName: id,
      detect: () => installed,
      globalSkillDir: `/tmp/${id}/skills`,
      extras: [],
    },
    installed,
  };
}

function makeManifest(agentIds: string[]): Manifest {
  const agents: Manifest['agents'] = {};
  for (const id of agentIds) {
    agents[id] = { skill: true, extras: [] };
  }
  return {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agents,
  };
}

describe('shouldUseFastPath', () => {
  it('returns false when no manifest', () => {
    expect(shouldUseFastPath(null, [makeAgent('cursor')])).toBe(false);
  });

  it('returns false when manifest has no agents', () => {
    const m = makeManifest([]);
    expect(shouldUseFastPath(m, [makeAgent('cursor')])).toBe(false);
  });

  it('returns true when manifest agents match installed agents', () => {
    const m = makeManifest(['cursor', 'claude-code']);
    const agents = [makeAgent('cursor'), makeAgent('claude-code')];
    expect(shouldUseFastPath(m, agents)).toBe(true);
  });

  it('returns false when new agents detected beyond manifest', () => {
    const m = makeManifest(['cursor']);
    const agents = [makeAgent('cursor'), makeAgent('claude-code')];
    expect(shouldUseFastPath(m, agents)).toBe(false);
  });

  it('returns false when manifest agent no longer detected', () => {
    const m = makeManifest(['cursor', 'claude-code']);
    const agents = [makeAgent('cursor')];
    expect(shouldUseFastPath(m, agents)).toBe(false);
  });
});
