import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_HOST = 'https://opentil.ai';
const CREDENTIALS_PATH = join(homedir(), '.til', 'credentials');

interface Profile {
  token: string;
  host?: string;
}

interface CredentialsFile {
  active?: string;
  profiles?: Record<string, Profile>;
}

export interface Config {
  token: string;
  host: string;
}

/**
 * Resolve token and host from environment or credentials file.
 *
 * Priority:
 * 1. $OPENTIL_TOKEN (+ $OPENTIL_HOST)
 * 2. ~/.til/credentials YAML (active profile)
 */
export function resolveConfig(): Config | null {
  // 1. Environment variable
  const envToken = process.env.OPENTIL_TOKEN;
  if (envToken) {
    return {
      token: envToken,
      host: process.env.OPENTIL_HOST || DEFAULT_HOST,
    };
  }

  // 2. Credentials file
  if (!existsSync(CREDENTIALS_PATH)) return null;

  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    const parsed = parseSimpleYaml(raw);
    if (!parsed) return null;

    const activeProfile = parsed.active || 'default';
    const profile = parsed.profiles?.[activeProfile];
    if (!profile?.token) return null;

    return {
      token: profile.token,
      host: profile.host || DEFAULT_HOST,
    };
  } catch {
    return null;
  }
}

/**
 * Minimal YAML parser for ~/.til/credentials.
 * Handles the flat structure: active, profiles.{name}.{token,host,...}
 */
function parseSimpleYaml(content: string): CredentialsFile | null {
  const lines = content.split('\n');
  const result: CredentialsFile = { profiles: {} };
  let currentProfile: string | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Top-level: "active: personal"
    const topMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (topMatch && !trimmed.startsWith(' ') && !trimmed.startsWith('\t')) {
      if (topMatch[1] === 'active') {
        result.active = topMatch[2].trim();
      }
      // "profiles:" header — just skip
      continue;
    }

    // Profile name: "  personal:" (2-space indent, no value)
    const profileMatch = trimmed.match(/^  (\w[\w-]*):\s*$/);
    if (profileMatch) {
      currentProfile = profileMatch[1];
      result.profiles![currentProfile] = { token: '' };
      continue;
    }

    // Profile field: "    token: til_abc..." (4-space indent)
    const fieldMatch = trimmed.match(/^    (\w+):\s*(.+)$/);
    if (fieldMatch && currentProfile && result.profiles![currentProfile]) {
      const [, key, value] = fieldMatch;
      (result.profiles![currentProfile] as Record<string, string>)[key] = value.trim();
    }
  }

  // Backward compat: plain token file (no YAML structure)
  if (!result.active && Object.keys(result.profiles!).length === 0) {
    const token = content.trim();
    if (token.startsWith('til_')) {
      return { active: 'default', profiles: { default: { token } } };
    }
    return null;
  }

  return result;
}
