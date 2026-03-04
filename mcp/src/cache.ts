import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

interface CacheEnvelope<T> {
  expires_at: number;
  data: T;
}

/**
 * File-based cache with TTL.
 * Shared protocol with the TIL skill — both read/write the same file format.
 */
export class FileCache<T> {
  constructor(
    private filePath: string,
    private ttlMs: number = 10 * 60 * 1000,
  ) {}

  get(): T | null {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const envelope: CacheEnvelope<T> = JSON.parse(raw);
      if (envelope.expires_at > Date.now()) {
        return envelope.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Return cached data even if expired (for fallback on API failure). */
  getStale(): T | null {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const envelope: CacheEnvelope<T> = JSON.parse(raw);
      return envelope.data;
    } catch {
      return null;
    }
  }

  set(data: T): void {
    const envelope: CacheEnvelope<T> = {
      expires_at: Date.now() + this.ttlMs,
      data,
    };
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
