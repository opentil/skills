import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { jsonOutput, jsonError, isJsonMode } from '../json-mode.js';
import { readExistingCredentials } from '../auth.js';
import type { ParsedFlags } from '../json-mode.js';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const UPLOAD_TIMEOUT = 30_000;

interface PresignResponse {
  signed_id: string;
  direct_upload: {
    url: string;
    headers: Record<string, string>;
  };
}

interface ImageResponse {
  id: string;
  url: string;
  thumb_url: string;
  medium_url: string;
  width: number;
  height: number;
  byte_size: number;
  content_type: string;
  description: string | null;
  created_at: string;
}

/** Re-throw errors originating from jsonError (test/embedded environments) */
function rethrowJsonError(err: unknown): void {
  if (err instanceof Error && err.message === 'jsonError') throw err;
}

export async function image(flags: ParsedFlags): Promise<void> {
  if (!isJsonMode()) {
    jsonError('image command requires --json flag. Usage: opentil image upload <file> --json', 'INVALID_COMMAND');
  }

  const subcommand = flags.positionals[1];
  if (subcommand !== 'upload') {
    jsonError(
      subcommand ? `Unknown subcommand: ${subcommand}` : 'Usage: opentil image upload <file> --json',
      'INVALID_COMMAND',
    );
  }

  const filePath = flags.positionals[2];
  if (!filePath) {
    jsonError('File path is required', 'FILE_NOT_FOUND');
  }

  // Validate file exists
  let fileStats;
  try {
    fileStats = statSync(filePath);
  } catch {
    jsonError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
  }

  // Validate extension
  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    jsonError(
      `Unsupported file format: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      'UNSUPPORTED_FORMAT',
    );
  }

  // Validate size
  if (fileStats.size > MAX_FILE_SIZE) {
    jsonError(
      `File too large: ${(fileStats.size / 1024 / 1024).toFixed(1)} MB (max 5 MB)`,
      'FILE_TOO_LARGE',
    );
  }

  // Check auth
  const creds = readExistingCredentials();
  if (!creds) {
    jsonError('Not authenticated. Run: npx @opentil/cli install', 'AUTH_REQUIRED');
  }

  const fileBuffer = readFileSync(filePath);
  const checksum = createHash('md5').update(fileBuffer).digest('base64');
  const filename = basename(filePath);
  const contentType = CONTENT_TYPE_MAP[ext];

  // Step 1: Presign
  let presignData: PresignResponse;
  try {
    const res = await fetch(`${creds.host}/api/v1/uploads/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.token}`,
      },
      body: JSON.stringify({
        filename,
        content_type: contentType,
        byte_size: fileStats.size,
        checksum,
      }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const errMsg = (body.error as Record<string, unknown>)?.message || `HTTP ${res.status}`;
      const errCode = res.status === 401 ? 'AUTH_REQUIRED' : 'PRESIGN_FAILED';
      jsonError(`Presign failed: ${errMsg}`, errCode);
    }

    presignData = (await res.json()) as PresignResponse;
  } catch (err) {
    rethrowJsonError(err);
    if ((err as NodeJS.ErrnoException).code === 'ABORT_ERR') {
      jsonError('Presign request timed out', 'TIMEOUT');
    }
    jsonError(`Network error during presign: ${err instanceof Error ? err.message : 'unknown'}`, 'NETWORK_ERROR');
  }

  // Step 2: Upload directly to storage
  try {
    const res = await fetch(presignData.direct_upload.url, {
      method: 'PUT',
      headers: {
        ...presignData.direct_upload.headers,
        'Content-Type': contentType,
      },
      body: fileBuffer,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
    });

    if (!res.ok) {
      jsonError(`Upload to storage failed: HTTP ${res.status}`, 'UPLOAD_FAILED');
    }
  } catch (err) {
    rethrowJsonError(err);
    if ((err as NodeJS.ErrnoException).code === 'ABORT_ERR') {
      jsonError('Upload timed out', 'TIMEOUT');
    }
    jsonError(`Network error during upload: ${err instanceof Error ? err.message : 'unknown'}`, 'UPLOAD_FAILED');
  }

  // Step 3: Confirm — create Image record
  let imageData: ImageResponse;
  try {
    const res = await fetch(`${creds.host}/api/v1/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.token}`,
      },
      body: JSON.stringify({ signed_id: presignData.signed_id }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const errMsg = (body.error as Record<string, unknown>)?.message || `HTTP ${res.status}`;
      jsonError(`Confirm failed: ${errMsg}`, 'CONFIRM_FAILED');
    }

    imageData = (await res.json()) as ImageResponse;
  } catch (err) {
    rethrowJsonError(err);
    if ((err as NodeJS.ErrnoException).code === 'ABORT_ERR') {
      jsonError('Confirm request timed out', 'TIMEOUT');
    }
    jsonError(`Network error during confirm: ${err instanceof Error ? err.message : 'unknown'}`, 'CONFIRM_FAILED');
  }

  jsonOutput({
    id: imageData.id,
    url: imageData.url,
    width: imageData.width,
    height: imageData.height,
    byte_size: imageData.byte_size,
    content_type: imageData.content_type,
  });
}
