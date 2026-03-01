import * as p from '@clack/prompts';
import pc from 'picocolors';
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { home, ensureDir, readTextFile } from './utils.js';
import { openBrowser } from './open-browser.js';

const DEFAULT_HOST = 'https://opentil.ai';
const CREDENTIALS_PATH = join(home, '.til', 'credentials');

// ─── Types ───────────────────────────────────────────────────────────

export type TokenValidation =
  | { status: 'valid'; username: string }
  | { status: 'expired' }
  | { status: 'network_error'; error?: string };

export interface AuthResult {
  authenticated: boolean;
  skipped?: boolean;
  username?: string;
  token?: string;
  host?: string;
}

interface Credentials {
  token: string;
  host: string;
  source: 'env' | 'file';
}

interface Profile {
  token: string;
  host?: string;
  [key: string]: string | undefined;
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

interface ValidatedProfile {
  name: string;
  token: string;
  host: string;
  validation: TokenValidation;
  isActive: boolean;
}

// ─── Main entry point ───────────────────────────────────────────────

export async function runAuthPhase(opts?: { fastPath?: boolean }): Promise<AuthResult> {
  if (!process.stdout.isTTY) {
    return { authenticated: false, skipped: true };
  }

  const host = process.env.OPENTIL_HOST || DEFAULT_HOST;
  const envToken = process.env.OPENTIL_TOKEN;
  const parsed = readCredentialsFile();
  const hasCredentials = parsed && Object.values(parsed.profiles).some((prof) => prof.token);

  // ── env var + credentials both present → warn conflict, use env token
  if (envToken && hasCredentials) {
    p.log.warn(
      `${pc.yellow('OPENTIL_TOKEN')} env var overrides ~/.til/credentials — run ${pc.cyan('unset OPENTIL_TOKEN')} to use saved accounts`,
    );
    const v = await validateToken(envToken, host);
    if (v.status === 'valid') {
      p.log.success(`Using env token: ${pc.green(`@${v.username}`)}`);
      return { authenticated: true, username: v.username, token: envToken, host };
    }
    if (v.status === 'expired') {
      p.log.error('OPENTIL_TOKEN is expired — unset it and re-authenticate');
      return { authenticated: false };
    }
    // network_error — fall through to credentials
    p.log.warn('Cannot verify OPENTIL_TOKEN (network error) — falling back to saved credentials');
  }

  // ── Only env var, no credentials
  if (envToken && !hasCredentials) {
    const v = await validateToken(envToken, host);
    if (v.status === 'valid') {
      p.log.success(`Connected as ${pc.green(`@${v.username}`)}`);
      return { authenticated: true, username: v.username, token: envToken, host };
    }
    if (v.status === 'expired') {
      p.log.warn('OPENTIL_TOKEN is set but expired — unset it to re-authenticate');
      return { authenticated: false };
    }
    // network_error
    p.log.warn('Cannot verify OPENTIL_TOKEN (network error)');
    return { authenticated: false, skipped: true };
  }

  // ── No credentials at all → fresh auth
  if (!parsed || !hasCredentials) {
    return freshAuthFlow(host);
  }

  // ── Has credentials — check active profile
  const activeName = parsed.active || Object.keys(parsed.profiles)[0];
  const activeProfile = activeName ? parsed.profiles[activeName] : undefined;

  if (!activeProfile?.token) {
    return multiProfileFlow(parsed, host, opts?.fastPath);
  }

  const activeHost = activeProfile.host || host;

  // Fast path: validate active profile without showing selector
  if (opts?.fastPath) {
    const v = await validateToken(activeProfile.token, activeHost);
    if (v.status === 'valid') {
      p.log.success(`Using ${pc.green(`@${v.username}`)}`);
      return { authenticated: true, username: v.username, token: activeProfile.token, host: activeHost };
    }
    if (v.status === 'network_error') {
      p.log.warn(`Cannot verify token (network error) — trusting cached profile ${pc.dim(`@${activeName}`)}`);
      return { authenticated: true, username: activeName, token: activeProfile.token, host: activeHost };
    }
    // expired → fall through to interactive flow
  }

  return multiProfileFlow(parsed, host, opts?.fastPath);
}

// ─── Profile flows ──────────────────────────────────────────────────

async function freshAuthFlow(host: string): Promise<AuthResult> {
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
      return { authenticated: true, username: result.username, token: result.token, host };
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
      return { authenticated: true, username: pasteResult.username, token: pasteResult.token, host };
    }
    return { authenticated: false };
  }

  // method === 'paste'
  const pasteResult = await pasteTokenAuth(host);
  if (pasteResult) {
    saveCredentials(pasteResult.token, pasteResult.username, host);
    p.log.success(`Connected as ${pc.green(`@${pasteResult.username}`)}`);
    return { authenticated: true, username: pasteResult.username, token: pasteResult.token, host };
  }
  return { authenticated: false };
}

async function multiProfileFlow(
  parsed: CredentialsFile,
  host: string,
  fastPath?: boolean,
): Promise<AuthResult> {
  const s = p.spinner();
  s.start('Checking accounts...');
  const profiles = await validateAllProfiles(parsed, host);
  s.stop(`Found ${profiles.length} account${profiles.length === 1 ? '' : 's'}`);

  // Fast path with expired active — just show selector, don't auto-skip
  const result = await showProfileSelector(profiles);
  if (!result) {
    return { authenticated: false, skipped: true };
  }

  if (result.action === 'new') {
    return freshAuthFlow(host);
  }

  const { profile } = result;

  if (profile.validation.status === 'expired') {
    p.log.warn(`Token for @${profile.name} has expired`);
    return freshAuthFlow(profile.host);
  }

  if (!profile.isActive) {
    updateActiveProfile(profile.name);
  }

  const username =
    profile.validation.status === 'valid' ? profile.validation.username : profile.name;

  p.log.success(`Using ${pc.green(`@${username}`)}`);
  return { authenticated: true, username, token: profile.token, host: profile.host };
}

// ─── Profile helpers ────────────────────────────────────────────────

function readCredentialsFile(): CredentialsFile | null {
  const raw = readTextFile(CREDENTIALS_PATH);
  if (!raw) return null;
  const parsed = parseCredentialsYaml(raw);
  if (!parsed) return null;
  // Migrate old profile keys if needed
  return migrateCredentials(parsed);
}

async function validateAllProfiles(
  parsed: CredentialsFile,
  defaultHost: string,
): Promise<ValidatedProfile[]> {
  const activeName = parsed.active || Object.keys(parsed.profiles)[0];
  const entries = Object.entries(parsed.profiles).filter(([, prof]) => prof.token);

  const validated = await Promise.all(
    entries.map(async ([name, profile]) => {
      const host = profile.host || defaultHost;
      const validation = await validateToken(profile.token, host);
      return { name, token: profile.token, host, validation, isActive: name === activeName };
    }),
  );

  // Sort: active first, then alphabetical
  return validated.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function showProfileSelector(
  profiles: ValidatedProfile[],
): Promise<{ action: 'use'; profile: ValidatedProfile } | { action: 'new' } | null> {
  const NEW_ACCOUNT = '__new__';
  const activeProfile = profiles.find((prof) => prof.isActive);

  const choice = await p.select({
    message: 'Which account to use?',
    options: [
      ...profiles.map((profile) => {
        const displayName =
          profile.validation.status === 'valid' ? profile.validation.username : profile.name;
        const hints: string[] = [];
        if (profile.isActive) hints.push('active');
        if (profile.validation.status === 'expired') hints.push('token expired');
        if (profile.validation.status === 'network_error') hints.push('offline?');

        return {
          value: profile.name,
          label: `@${displayName}`,
          hint: hints.join(', ') || undefined,
        };
      }),
      { value: NEW_ACCOUNT, label: '+ Connect a new account' },
    ],
    initialValue: activeProfile?.name,
  });

  if (p.isCancel(choice)) return null;
  if (choice === NEW_ACCOUNT) return { action: 'new' };
  const selected = profiles.find((prof) => prof.name === choice)!;
  return { action: 'use', profile: selected };
}

function updateActiveProfile(name: string): void {
  const raw = readTextFile(CREDENTIALS_PATH);
  if (!raw) return;
  const creds = parseCredentialsYaml(raw);
  if (!creds) return;
  creds.active = name;
  writeFileSync(CREDENTIALS_PATH, serializeCredentialsYaml(creds), { mode: 0o600 });
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

  const activeProfile = parsed.active || Object.keys(parsed.profiles)[0];
  const profile = activeProfile ? parsed.profiles[activeProfile] : undefined;
  if (!profile?.token) return null;

  return {
    token: profile.token,
    host: profile.host || DEFAULT_HOST,
    source: 'file',
  };
}

// ─── Token validation (tri-state) ───────────────────────────────────

export async function validateToken(token: string, host: string): Promise<TokenValidation> {
  try {
    const res = await fetch(`${host}/api/v1/site`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { username?: string };
      if (data.username) return { status: 'valid', username: data.username };
      return { status: 'expired' };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: 'expired' };
    }
    // 5xx or other server errors → treat as network error
    return { status: 'network_error', error: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'network_error', error: err instanceof Error ? err.message : undefined };
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
      body: JSON.stringify({ scopes: ['read', 'write', 'delete'] }),
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
        const v = await validateToken(data.access_token, host);
        if (v.status === 'valid') {
          s.stop(`Authorized as ${pc.green(`@${v.username}`)}`);
          return { token: data.access_token, username: v.username };
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
  const v = await validateToken(trimmed, host);
  if (v.status !== 'valid') {
    p.log.error('Could not verify token');
    return null;
  }

  return { token: trimmed, username: v.username };
}

// ─── Profile key helpers ────────────────────────────────────────────

function profileKey(username: string, host: string): string {
  if (!host || host === DEFAULT_HOST) return username;
  // Extract domain from URL: "https://example.com" → "example.com"
  const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `${username}@${domain}`;
}

function migrateCredentials(creds: CredentialsFile): CredentialsFile {
  // No migration needed — the format is already using simple keys
  // Future migrations can be added here
  return creds;
}

// ─── Credential persistence ─────────────────────────────────────────

function saveCredentials(token: string, username: string, host: string): void {
  const raw = readTextFile(CREDENTIALS_PATH);
  const creds = (raw ? parseCredentialsYaml(raw) : null) || { profiles: {} };

  const key = profileKey(username, host);

  // Upsert profile, preserving extra fields (nickname, site_url, etc.)
  creds.profiles[key] = {
    ...creds.profiles[key],
    token,
    ...(host !== DEFAULT_HOST ? { host } : {}),
  };
  creds.active = key;

  ensureDir(dirname(CREDENTIALS_PATH));
  writeFileSync(CREDENTIALS_PATH, serializeCredentialsYaml(creds), { mode: 0o600 });
}

// ─── YAML parsing ───────────────────────────────────────────────────

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

    // Profile name: "  personal:" or "  user@host.com:" (2-space indent, no value)
    const profileMatch = trimmed.match(/^  ([\w][\w@.\-]*):\s*$/);
    if (profileMatch) {
      currentProfile = profileMatch[1];
      result.profiles[currentProfile] = { token: '' };
      continue;
    }

    // Profile field: "    token: til_abc..." (4-space indent)
    const fieldMatch = trimmed.match(/^    ([\w_]+):\s*(.+)$/);
    if (fieldMatch && currentProfile && result.profiles[currentProfile]) {
      const [, key, value] = fieldMatch;
      (result.profiles[currentProfile] as Record<string, string>)[key] = value.trim();
    }
  }

  // No valid structure found
  if (!result.active && Object.keys(result.profiles).length === 0) {
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
    for (const [key, value] of Object.entries(profile)) {
      if (value) {
        lines.push(`    ${key}: ${value}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
