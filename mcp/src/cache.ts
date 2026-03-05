import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

interface CacheEnvelope<T> {
  profile?: string;
  expires_at: number;
  data: T;
}

/**
 * File-based cache with TTL.
 * Shared protocol with the TIL skill — both read/write the same file format.
 *
 * Profile-aware: when a profile is provided, get() only returns data if the
 * cached profile matches. This prevents cross-account data leakage when
 * switching between multiple TIL profiles.
 */
export class FileCache<T> {
  constructor(
    private filePath: string,
    private ttlMs: number = 10 * 60 * 1000,
  ) {}

  get(profile?: string): T | null {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const envelope: CacheEnvelope<T> = JSON.parse(raw);
      if (profile && envelope.profile !== profile) {
        return null;
      }
      if (envelope.expires_at > Date.now()) {
        return envelope.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Return cached data even if expired (for fallback on API failure). */
  getStale(profile?: string): T | null {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const envelope: CacheEnvelope<T> = JSON.parse(raw);
      if (profile && envelope.profile !== profile) {
        return null;
      }
      return envelope.data;
    } catch {
      return null;
    }
  }

  set(data: T, profile?: string): void {
    const envelope: CacheEnvelope<T> = {
      expires_at: Date.now() + this.ttlMs,
      data,
    };
    if (profile) {
      envelope.profile = profile;
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(envelope, null, 2));
    } catch {
      // Silently fail — cache is best-effort
    }
  }

  invalidate(): void {
    try {
      unlinkSync(this.filePath);
    } catch {
      // Ignore ENOENT
    }
  }
}
