import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, rmdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const home = homedir();

export function expandHome(p: string): string {
  return p.startsWith('~') ? join(home, p.slice(1)) : p;
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeJsonFile(path: string, data: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function readTextFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function writeTextFile(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf-8');
}

export function copyDir(src: string, dest: string): void {
  ensureDir(dirname(dest));
  cpSync(src, dest, { recursive: true });
}

export function removeFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // ignore
  }
}

export function removeDir(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function pruneEmptyParents(dir: string, stopAt: string): void {
  let current = dir;
  while (current !== stopAt && current !== dirname(current)) {
    try {
      const entries = readdirSync(current);
      if (entries.length === 0) {
        rmdirSync(current);
        current = dirname(current);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}
