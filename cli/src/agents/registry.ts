import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { home } from '../utils.js';

export type ExtraType = 'hooks' | 'claude-md';

export interface AgentConfig {
  name: string;
  displayName: string;
  detect: () => boolean;
  globalSkillDir: string;
  extras: ExtraType[];
}

const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');

// XDG_CONFIG_HOME with fallback, matching skills CLI behavior
const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, '.config');

export function getOpenClawGlobalSkillDir(): string {
  if (existsSync(join(home, '.openclaw'))) {
    return join(home, '.openclaw', 'skills');
  }
  if (existsSync(join(home, '.clawdbot'))) {
    return join(home, '.clawdbot', 'skills');
  }
  if (existsSync(join(home, '.moltbot'))) {
    return join(home, '.moltbot', 'skills');
  }
  return join(home, '.openclaw', 'skills');
}

export const agents: Record<string, AgentConfig> = {
  // --- Agents with extras ---
  'claude-code': {
    name: 'claude-code',
    displayName: 'Claude Code',
    detect: () => existsSync(claudeHome),
    globalSkillDir: join(claudeHome, 'skills'),
    extras: ['hooks', 'claude-md'],
  },

  // --- Standard agents (alphabetical) ---
  adal: {
    name: 'adal',
    displayName: 'AdaL',
    detect: () => existsSync(join(home, '.adal')),
    globalSkillDir: join(home, '.adal', 'skills'),
    extras: [],
  },
  amp: {
    name: 'amp',
    displayName: 'Amp',
    detect: () => existsSync(join(configHome, 'amp')),
    globalSkillDir: join(configHome, 'agents', 'skills'),
    extras: [],
  },
  antigravity: {
    name: 'antigravity',
    displayName: 'Antigravity',
    detect: () => existsSync(join(home, '.gemini', 'antigravity')),
    globalSkillDir: join(home, '.gemini', 'antigravity', 'skills'),
    extras: [],
  },
  augment: {
    name: 'augment',
    displayName: 'Augment',
    detect: () => existsSync(join(home, '.augment')),
    globalSkillDir: join(home, '.augment', 'skills'),
    extras: [],
  },
  cline: {
    name: 'cline',
    displayName: 'Cline',
    detect: () => existsSync(join(home, '.cline')),
    globalSkillDir: join(home, '.cline', 'skills'),
    extras: [],
  },
  codebuddy: {
    name: 'codebuddy',
    displayName: 'CodeBuddy',
    detect: () => existsSync(join(home, '.codebuddy')),
    globalSkillDir: join(home, '.codebuddy', 'skills'),
    extras: [],
  },
  codex: {
    name: 'codex',
    displayName: 'Codex',
    detect: () => existsSync(codexHome) || existsSync('/etc/codex'),
    globalSkillDir: join(codexHome, 'skills'),
    extras: [],
  },
  'command-code': {
    name: 'command-code',
    displayName: 'Command Code',
    detect: () => existsSync(join(home, '.commandcode')),
    globalSkillDir: join(home, '.commandcode', 'skills'),
    extras: [],
  },
  continue: {
    name: 'continue',
    displayName: 'Continue',
    detect: () => existsSync(join(home, '.continue')),
    globalSkillDir: join(home, '.continue', 'skills'),
    extras: [],
  },
  cortex: {
    name: 'cortex',
    displayName: 'Cortex Code',
    detect: () => existsSync(join(home, '.snowflake', 'cortex')),
    globalSkillDir: join(home, '.snowflake', 'cortex', 'skills'),
    extras: [],
  },
  crush: {
    name: 'crush',
    displayName: 'Crush',
    detect: () => existsSync(join(configHome, 'crush')),
    globalSkillDir: join(configHome, 'crush', 'skills'),
    extras: [],
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    detect: () => existsSync(join(home, '.cursor')),
    globalSkillDir: join(home, '.cursor', 'skills'),
    extras: [],
  },
  droid: {
    name: 'droid',
    displayName: 'Droid',
    detect: () => existsSync(join(home, '.factory')),
    globalSkillDir: join(home, '.factory', 'skills'),
    extras: [],
  },
  'gemini-cli': {
    name: 'gemini-cli',
    displayName: 'Gemini CLI',
    detect: () => existsSync(join(home, '.gemini')),
    globalSkillDir: join(home, '.gemini', 'skills'),
    extras: [],
  },
  'github-copilot': {
    name: 'github-copilot',
    displayName: 'GitHub Copilot',
    detect: () => existsSync(join(home, '.copilot')),
    globalSkillDir: join(home, '.copilot', 'skills'),
    extras: [],
  },
  goose: {
    name: 'goose',
    displayName: 'Goose',
    detect: () => existsSync(join(configHome, 'goose')),
    globalSkillDir: join(configHome, 'goose', 'skills'),
    extras: [],
  },
  'iflow-cli': {
    name: 'iflow-cli',
    displayName: 'iFlow CLI',
    detect: () => existsSync(join(home, '.iflow')),
    globalSkillDir: join(home, '.iflow', 'skills'),
    extras: [],
  },
  junie: {
    name: 'junie',
    displayName: 'Junie',
    detect: () => existsSync(join(home, '.junie')),
    globalSkillDir: join(home, '.junie', 'skills'),
    extras: [],
  },
  kilo: {
    name: 'kilo',
    displayName: 'Kilo Code',
    detect: () => existsSync(join(home, '.kilocode')),
    globalSkillDir: join(home, '.kilocode', 'skills'),
    extras: [],
  },
  'kimi-cli': {
    name: 'kimi-cli',
    displayName: 'Kimi Code CLI',
    detect: () => existsSync(join(home, '.kimi')),
    globalSkillDir: join(configHome, 'agents', 'skills'),
    extras: [],
  },
  'kiro-cli': {
    name: 'kiro-cli',
    displayName: 'Kiro CLI',
    detect: () => existsSync(join(home, '.kiro')),
    globalSkillDir: join(home, '.kiro', 'skills'),
    extras: [],
  },
  kode: {
    name: 'kode',
    displayName: 'Kode',
    detect: () => existsSync(join(home, '.kode')),
    globalSkillDir: join(home, '.kode', 'skills'),
    extras: [],
  },
  mcpjam: {
    name: 'mcpjam',
    displayName: 'MCPJam',
    detect: () => existsSync(join(home, '.mcpjam')),
    globalSkillDir: join(home, '.mcpjam', 'skills'),
    extras: [],
  },
  'mistral-vibe': {
    name: 'mistral-vibe',
    displayName: 'Mistral Vibe',
    detect: () => existsSync(join(home, '.vibe')),
    globalSkillDir: join(home, '.vibe', 'skills'),
    extras: [],
  },
  mux: {
    name: 'mux',
    displayName: 'Mux',
    detect: () => existsSync(join(home, '.mux')),
    globalSkillDir: join(home, '.mux', 'skills'),
    extras: [],
  },
  neovate: {
    name: 'neovate',
    displayName: 'Neovate',
    detect: () => existsSync(join(home, '.neovate')),
    globalSkillDir: join(home, '.neovate', 'skills'),
    extras: [],
  },
  opencode: {
    name: 'opencode',
    displayName: 'OpenCode',
    detect: () => existsSync(join(configHome, 'opencode')),
    globalSkillDir: join(configHome, 'opencode', 'skills'),
    extras: [],
  },
  openclaw: {
    name: 'openclaw',
    displayName: 'OpenClaw',
    detect: () =>
      existsSync(join(home, '.openclaw')) ||
      existsSync(join(home, '.clawdbot')) ||
      existsSync(join(home, '.moltbot')),
    globalSkillDir: getOpenClawGlobalSkillDir(),
    extras: [],
  },
  openhands: {
    name: 'openhands',
    displayName: 'OpenHands',
    detect: () => existsSync(join(home, '.openhands')),
    globalSkillDir: join(home, '.openhands', 'skills'),
    extras: [],
  },
  pi: {
    name: 'pi',
    displayName: 'Pi',
    detect: () => existsSync(join(home, '.pi', 'agent')),
    globalSkillDir: join(home, '.pi', 'agent', 'skills'),
    extras: [],
  },
  pochi: {
    name: 'pochi',
    displayName: 'Pochi',
    detect: () => existsSync(join(home, '.pochi')),
    globalSkillDir: join(home, '.pochi', 'skills'),
    extras: [],
  },
  qoder: {
    name: 'qoder',
    displayName: 'Qoder',
    detect: () => existsSync(join(home, '.qoder')),
    globalSkillDir: join(home, '.qoder', 'skills'),
    extras: [],
  },
  'qwen-code': {
    name: 'qwen-code',
    displayName: 'Qwen Code',
    detect: () => existsSync(join(home, '.qwen')),
    globalSkillDir: join(home, '.qwen', 'skills'),
    extras: [],
  },
  replit: {
    name: 'replit',
    displayName: 'Replit',
    detect: () => existsSync(join(process.cwd(), '.replit')),
    globalSkillDir: join(configHome, 'agents', 'skills'),
    extras: [],
  },
  roo: {
    name: 'roo',
    displayName: 'Roo Code',
    detect: () => existsSync(join(home, '.roo')),
    globalSkillDir: join(home, '.roo', 'skills'),
    extras: [],
  },
  trae: {
    name: 'trae',
    displayName: 'Trae',
    detect: () => existsSync(join(home, '.trae')),
    globalSkillDir: join(home, '.trae', 'skills'),
    extras: [],
  },
  'trae-cn': {
    name: 'trae-cn',
    displayName: 'Trae CN',
    detect: () => existsSync(join(home, '.trae-cn')),
    globalSkillDir: join(home, '.trae-cn', 'skills'),
    extras: [],
  },
  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    detect: () => existsSync(join(home, '.codeium', 'windsurf')),
    globalSkillDir: join(home, '.codeium', 'windsurf', 'skills'),
    extras: [],
  },
  zencoder: {
    name: 'zencoder',
    displayName: 'Zencoder',
    detect: () => existsSync(join(home, '.zencoder')),
    globalSkillDir: join(home, '.zencoder', 'skills'),
    extras: [],
  },
};

export function getAgentConfig(id: string): AgentConfig | undefined {
  return agents[id];
}
