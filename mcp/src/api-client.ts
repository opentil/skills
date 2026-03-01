import { ApiError } from './errors.js';
import type { Config } from './config.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

const TIMEOUT_MS = 15_000;

export class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(config: Config) {
    this.baseUrl = `${config.host}/api/v1`;
    this.token = config.token;
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const res = await fetch(url.toString(), {
      headers: this.headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    return this.handleResponse<T>(res);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'X-OpenTIL-Source': 'agent',
      'X-OpenTIL-Agent': 'MCP Server (stdio)',
      'X-OpenTIL-Client': `@opentil/mcp/${PKG_VERSION}`,
    };
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let code = 'api_error';
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        code = body?.error?.code || code;
        message = body?.error?.message || message;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(res.status, code, message);
    }

    return res.json() as Promise<T>;
  }
}
