import * as p from '@clack/prompts';
import pc from 'picocolors';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { home, ensureDir, readTextFile } from './utils.js';
import { openBrowser } from './open-browser.js';

const DEFAULT_HOST = 'https://opentil.ai';
const CREDENTIALS_PATH = join(home, '.til', 'credentials');

export interface AuthResult {
  authenticated: boolean;
  skipped?: boolean;
  username?: string;
}

interface Credentials {
  token: string;
  host: string;
  source: 'env' | 'file';
}

interface Profile {
  token: string;
  host?: string;
}

interface CredentialsFile {
  active?: string;
  profiles: Record<string, Profile>;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

// ─── Main entry point ───────────────────────────────────────────────

export async function runAuthPhase(): Promise<AuthResult> {
  if (!process.stdout.isTTY) {
    return { authenticated: false, skipped: true };
  }

  const host = process.env.OPENTIL_HOST || DEFAULT_HOST;

  // Check existing credentials
  const existing = readExistingCredentials();
  if (existing) {
    const username = await validateToken(existing.token, existing.host);
    if (username) {
      p.log.success(`Already connected as ${pc.green(`@${username}`)}`);
      return { authenticated: true, username };
    }
    if (existing.source === 'env') {
      p.log.warn(`OPENTIL_TOKEN is set but invalid — unset it to re-authenticate`);
      return { authenticated: false, skipped: true };
    }
    // File token is invalid — fall through to auth flow
    p.log.warn('Saved token is no longer valid');
  }

  // Auth method selection
  const method = await p.select({
    message: 'Connect your OpenTIL account?',
    options: [
      { value: 'browser', label: 'Open browser', hint: 'recommended' },
      { value: 'paste', label: 'Paste a token' },
      { value: 'skip', label: 'Skip for now' },
    ],
  });

  if (p.isCancel(method) || method === 'skip') {
    return { authenticated: false, skipped: true };
  }

  if (method === 'browser') {
    const result = await deviceFlowAuth(host);
    if (result) {
      saveCredentials(result.token, result.username, host);
      p.log.success(`Connected as ${pc.green(`@${result.username}`)}`);
      return { authenticated: true, username: result.username };
    }
    // Device flow failed — offer paste fallback
    const tryPaste = await p.confirm({ message: 'Try pasting a token instead?' });
    if (p.isCancel(tryPaste) || !tryPaste) {
      return { authenticated: false };
    }
    const pasteResult = await pasteTokenAuth(host);
    if (pasteResult) {
      saveCredentials(pasteResult.token, pasteResult.username, host);
      p.log.success(`Connected as ${pc.green(`@${pasteResult.username}`)}`);
      return { authenticated: true, username: pasteResult.username };
    }
    return { authenticated: false };
  }

  // method === 'paste'
  const pasteResult = await pasteTokenAuth(host);
  if (pasteResult) {
    saveCredentials(pasteResult.token, pasteResult.username, host);
    p.log.success(`Connected as ${pc.green(`@${pasteResult.username}`)}`);
    return { authenticated: true, username: pasteResult.username };
  }
  return { authenticated: false };
}

// ─── Credential reading ─────────────────────────────────────────────

export function readExistingCredentials(): Credentials | null {
  // 1. Environment variable
  const envToken = process.env.OPENTIL_TOKEN;
  if (envToken) {
    return {
      token: envToken,
      host: process.env.OPENTIL_HOST || DEFAULT_HOST,
      source: 'env',
    };
  }

  // 2. Credentials file
  const raw = readTextFile(CREDENTIALS_PATH);
  if (!raw) return null;

  const parsed = parseCredentialsYaml(raw);
  if (!parsed) return null;

  const activeProfile = parsed.active || 'default';
  const profile = parsed.profiles[activeProfile];
  if (!profile?.token) return null;

  return {
    token: profile.token,
    host: profile.host || DEFAULT_HOST,
    source: 'file',
  };
}

// ─── Token validation ───────────────────────────────────────────────

export async function validateToken(token: string, host: string): Promise<string | null> {
  try {
    const res = await fetch(`${host}/api/v1/site`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string };
    return data.username || null;
  } catch {
    return null;
  }
}

// ─── Device flow auth ───────────────────────────────────────────────

async function deviceFlowAuth(host: string): Promise<{ token: string; username: string } | null> {
  // Request device code
  let deviceCode: DeviceCodeResponse;
  try {
    const res = await fetch(`${host}/api/v1/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopes: ['read', 'write'] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      p.log.error('Could not reach the server');
      return null;
    }
    deviceCode = (await res.json()) as DeviceCodeResponse;
  } catch {
    p.log.error('Could not reach the server');
    return null;
  }

  // Open browser
  const authUrl = `${deviceCode.verification_uri}?user_code=${deviceCode.user_code}`;
  const opened = await openBrowser(authUrl);

  if (opened) {
    p.log.info(`Opened browser to authorize — your code: ${pc.bold(pc.cyan(deviceCode.user_code))}`);
  } else {
    p.log.info(`Open this URL in your browser:`);
    p.log.info(`  ${pc.underline(authUrl)}`);
    p.log.info(`  Code: ${pc.bold(pc.cyan(deviceCode.user_code))}`);
  }

  // Poll for token
  const s = p.spinner();
  s.start('Waiting for authorization...');

  let interval = deviceCode.interval * 1000;
  const deadline = Date.now() + deviceCode.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);

    try {
      const res = await fetch(`${host}/api/v1/oauth/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_code: deviceCode.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { access_token: string };
        const username = await validateToken(data.access_token, host);
        if (username) {
          s.stop(`Authorized as ${pc.green(`@${username}`)}`);
          return { token: data.access_token, username };
        }
        s.stop('Authorization failed');
        return null;
      }

      // 400-level responses with error codes
      const error = (await res.json()) as { error?: string };
      if (error.error === 'slow_down') {
        interval += 5000;
      } else if (error.error === 'expired_token') {
        s.stop('Authorization timed out');
        return null;
      }
      // authorization_pending → continue polling
    } catch {
      // Network error during poll — silently retry
    }
  }

  s.stop('Authorization timed out');
  return null;
}

// ─── Paste token auth ───────────────────────────────────────────────

async function pasteTokenAuth(host: string): Promise<{ token: string; username: string } | null> {
  const token = await p.text({
    message: 'Paste your token:',
    placeholder: 'til_...',
    validate(value) {
      if (!value.trim()) return 'Token is required';
    },
  });

  if (p.isCancel(token)) {
    return null;
  }

  const trimmed = (token as string).trim();
  const username = await validateToken(trimmed, host);
  if (!username) {
    p.log.error('Could not verify token');
    return null;
  }

  return { token: trimmed, username };
}

// ─── Credential persistence ─────────────────────────────────────────

function saveCredentials(token: string, username: string, host: string): void {
  const raw = readTextFile(CREDENTIALS_PATH);
  const creds = (raw ? parseCredentialsYaml(raw) : null) || { profiles: {} };

  // Upsert profile by username
  creds.profiles[username] = {
    token,
    ...(host !== DEFAULT_HOST ? { host } : {}),
  };
  creds.active = username;

  ensureDir(dirname(CREDENTIALS_PATH));
  writeFileSync(CREDENTIALS_PATH, serializeCredentialsYaml(creds), { mode: 0o600 });
}

// ─── YAML parsing (duplicated from mcp/src/config.ts) ───────────────

function parseCredentialsYaml(content: string): CredentialsFile | null {
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
      continue;
    }

    // Profile name: "  personal:" (2-space indent, no value)
    const profileMatch = trimmed.match(/^  (\w[\w-]*):\s*$/);
    if (profileMatch) {
      currentProfile = profileMatch[1];
      result.profiles[currentProfile] = { token: '' };
      continue;
    }

    // Profile field: "    token: til_abc..." (4-space indent)
    const fieldMatch = trimmed.match(/^    (\w+):\s*(.+)$/);
    if (fieldMatch && currentProfile && result.profiles[currentProfile]) {
      const [, key, value] = fieldMatch;
      (result.profiles[currentProfile] as Record<string, string>)[key] = value.trim();
    }
  }

  // Backward compat: plain token file (no YAML structure)
  if (!result.active && Object.keys(result.profiles).length === 0) {
    const token = content.trim();
    if (token.startsWith('til_')) {
      return { active: 'default', profiles: { default: { token } } };
    }
    return null;
  }

  return result;
}

function serializeCredentialsYaml(creds: CredentialsFile): string {
  const lines: string[] = [];

  if (creds.active) {
    lines.push(`active: ${creds.active}`);
  }

  lines.push('profiles:');
  for (const [name, profile] of Object.entries(creds.profiles)) {
    lines.push(`  ${name}:`);
    lines.push(`    token: ${profile.token}`);
    if (profile.host) {
      lines.push(`    host: ${profile.host}`);
    }
  }

  return lines.join('\n') + '\n';
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
