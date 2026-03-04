export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function formatError(error: unknown): string {
  if (error instanceof ApiError) {
    return `API error ${error.status}: ${error.message}`;
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Request timed out (15s). Is the OpenTIL API reachable?';
    }
    return error.message;
  }
  return String(error);
}
