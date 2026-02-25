import { agents, type AgentConfig } from './registry.js';

export interface DetectedAgent {
  id: string;
  config: AgentConfig;
  installed: boolean;
}

export function detectAgents(): DetectedAgent[] {
  return Object.entries(agents).map(([id, config]) => ({
    id,
    config,
    installed: config.detect(),
  }));
}
