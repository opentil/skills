import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Capture helpers ────────────────────────────────────────────────

class JsonOutputCapture extends Error {
  constructor(public data: Record<string, unknown>) {
    super('jsonOutput');
  }
}

class JsonErrorCapture extends Error {
  constructor(
    public errorMessage: string,
    public code?: string,
  ) {
    super('jsonError');
  }
}

// ─── Mock state ─────────────────────────────────────────────────────

let mockCreds: { token: string; host: string; source: string } | null = null;
let mockFetchResponses: Array<{ ok: boolean; status: number; body: unknown }> = [];
let fetchCallIndex = 0;
let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../json-mode.js', () => ({
  isJsonMode: () => true,
  jsonOutput: (data: Record<string, unknown>) => {
    throw new JsonOutputCapture(data);
  },
  jsonError: (message: string, code?: string) => {
    throw new JsonErrorCapture(message, code);
  },
}));

vi.mock('../auth.js', () => ({
  readExistingCredentials: () => mockCreds,
}));

vi.mock('../utils.js', () => ({
  home: '/mock',
}));

// Mock global fetch
const mockFetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
  fetchCalls.push({ url: urlStr, options: options || {} });
  const response = mockFetchResponses[fetchCallIndex++];
  if (!response) {
    return { ok: false, status: 500, json: async () => ({}) };
  }
  return {
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  };
});

vi.stubGlobal('fetch', mockFetch);

// Import after mocks
const { image } = await import('../commands/image.js');

// ─── Test fixtures ──────────────────────────────────────────────────

const testDir = join(tmpdir(), 'opentil-image-test');
const testPng = join(testDir, 'test.png');
const testBmp = join(testDir, 'test.bmp');
const testLarge = join(testDir, 'large.png');

function makeFlags(positionals: string[] = ['image', 'upload', testPng]) {
  return { command: 'image', json: true, positionals };
}

function setupPresignSuccess() {
  mockFetchResponses = [
    {
      ok: true,
      status: 201,
      body: {
        signed_id: 'signed_abc123',
        direct_upload: {
          url: 'https://storage.example.com/upload',
          headers: { 'Content-MD5': 'abc123' },
        },
      },
    },
    { ok: true, status: 200, body: {} }, // PUT to storage
    {
      ok: true,
      status: 201,
      body: {
        id: 'img_123',
        url: 'https://cdn.example.com/image.png',
        width: 100,
        height: 100,
        byte_size: 67,
        content_type: 'image/png',
      },
    },
  ];
}

// ─── Setup / teardown ───────────────────────────────────────────────

beforeEach(() => {
  mockCreds = { token: 'tok_test', host: 'https://opentil.ai', source: 'file' };
  mockFetchResponses = [];
  fetchCallIndex = 0;
  fetchCalls = [];
  mockFetch.mockClear();

  // Create test directory and files
  mkdirSync(testDir, { recursive: true });
  // Minimal valid-ish PNG (just needs to exist for fs checks)
  writeFileSync(testPng, Buffer.from('89504e470d0a1a0a', 'hex'));
  writeFileSync(testBmp, Buffer.from('BM'));
});

// Cleanup after all tests
import { afterAll } from 'vitest';
afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('image upload --json', () => {
  // ── Input validation ──

  it('errors on missing file path', async () => {
    try {
      await image(makeFlags(['image', 'upload']));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('FILE_NOT_FOUND');
    }
  });

  it('errors on unknown subcommand', async () => {
    try {
      await image(makeFlags(['image', 'list']));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('INVALID_COMMAND');
    }
  });

  it('errors on missing subcommand', async () => {
    try {
      await image(makeFlags(['image']));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('INVALID_COMMAND');
    }
  });

  it('errors on file not found', async () => {
    try {
      await image(makeFlags(['image', 'upload', '/nonexistent/file.png']));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('FILE_NOT_FOUND');
    }
  });

  it('errors on unsupported extension (.bmp)', async () => {
    try {
      await image(makeFlags(['image', 'upload', testBmp]));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('errors on file too large (>5MB)', async () => {
    // Create a file > 5MB
    writeFileSync(testLarge, Buffer.alloc(6 * 1024 * 1024));

    try {
      await image(makeFlags(['image', 'upload', testLarge]));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('FILE_TOO_LARGE');
    }
  });

  // ── Auth ──

  it('errors when not authenticated', async () => {
    mockCreds = null;

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('AUTH_REQUIRED');
    }
  });

  // ── Presign step ──

  it('errors when presign returns 401', async () => {
    mockFetchResponses = [
      {
        ok: false,
        status: 401,
        body: { error: { message: 'Unauthorized' } },
      },
    ];

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('AUTH_REQUIRED');
    }
  });

  it('errors when presign returns 422 (quota exceeded)', async () => {
    mockFetchResponses = [
      {
        ok: false,
        status: 422,
        body: { error: { message: 'Storage limit exceeded' } },
      },
    ];

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('PRESIGN_FAILED');
    }
  });

  // ── Upload step ──

  it('errors when PUT to storage fails', async () => {
    mockFetchResponses = [
      {
        ok: true,
        status: 201,
        body: {
          signed_id: 'signed_abc',
          direct_upload: { url: 'https://storage.example.com/upload', headers: {} },
        },
      },
      { ok: false, status: 500, body: {} },
    ];

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('UPLOAD_FAILED');
    }
  });

  it('sends correct headers from presign response', async () => {
    setupPresignSuccess();

    try {
      await image(makeFlags());
    } catch {
      // Ignore exit
    }

    // Second call is the PUT to storage
    expect(fetchCalls.length).toBeGreaterThanOrEqual(2);
    const putCall = fetchCalls[1];
    expect(putCall.url).toBe('https://storage.example.com/upload');
    const headers = putCall.options.headers as Record<string, string>;
    expect(headers['Content-MD5']).toBe('abc123');
    expect(headers['Content-Type']).toBe('image/png');
  });

  // ── Confirm step ──

  it('errors when confirm returns non-ok', async () => {
    mockFetchResponses = [
      {
        ok: true,
        status: 201,
        body: {
          signed_id: 'signed_abc',
          direct_upload: { url: 'https://storage.example.com/upload', headers: {} },
        },
      },
      { ok: true, status: 200, body: {} }, // PUT success
      {
        ok: false,
        status: 422,
        body: { error: { message: 'Corrupt image' } },
      },
    ];

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('CONFIRM_FAILED');
    }
  });

  // ── Success ──

  it('returns image data on successful 3-step flow', async () => {
    setupPresignSuccess();

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.id).toBe('img_123');
      expect(data.url).toBe('https://cdn.example.com/image.png');
    }
  });

  it('output contains id, url, width, height, byte_size, content_type', async () => {
    setupPresignSuccess();

    try {
      await image(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('width');
      expect(data).toHaveProperty('height');
      expect(data).toHaveProperty('byte_size');
      expect(data).toHaveProperty('content_type');
    }
  });

  it('makes 3 fetch calls in correct order', async () => {
    setupPresignSuccess();

    try {
      await image(makeFlags());
    } catch {
      // Ignore exit
    }

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[0].url).toContain('/uploads/presign');
    expect(fetchCalls[1].url).toBe('https://storage.example.com/upload');
    expect(fetchCalls[2].url).toContain('/images');
  });

  it('sends authorization header to presign and confirm but not to storage', async () => {
    setupPresignSuccess();

    try {
      await image(makeFlags());
    } catch {
      // Ignore exit
    }

    const presignHeaders = fetchCalls[0].options.headers as Record<string, string>;
    expect(presignHeaders['Authorization']).toBe('Bearer tok_test');

    const putHeaders = fetchCalls[1].options.headers as Record<string, string>;
    expect(putHeaders['Authorization']).toBeUndefined();

    const confirmHeaders = fetchCalls[2].options.headers as Record<string, string>;
    expect(confirmHeaders['Authorization']).toBe('Bearer tok_test');
  });
});
