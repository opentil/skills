import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getVersion(): string {
  // Read from package.json
  const candidates = [
    join(__dirname, '..', '..', 'package.json'),   // from cli/src or cli/dist
    join(__dirname, '..', 'package.json'),          // fallback
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return '0.0.0';
}

export async function checkLatestVersion(): Promise<{
  current: string;
  latest: string;
  isOutdated: boolean;
} | null> {
  const current = getVersion();
  try {
    const res = await fetch('https://registry.npmjs.org/@opentil/cli/latest', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    const latest = data.version ?? current;
    return { current, latest, isOutdated: compareVersions(current, latest) < 0 };
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
