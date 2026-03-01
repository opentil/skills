// ─── Global JSON mode ────────────────────────────────────────────────

let _jsonMode = false;

export function enableJsonMode(): void {
  _jsonMode = true;
}

export function isJsonMode(): boolean {
  return _jsonMode;
}

/** @internal — test helper */
export function _resetJsonMode(): void {
  _jsonMode = false;
}

/**
 * Output a JSON success result to stdout and exit.
 */
export function jsonOutput(data: Record<string, unknown>): never {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

/**
 * Output a JSON error to stdout and exit with code 1.
 */
export function jsonError(message: string, code?: string, extra?: Record<string, unknown>): never {
  const payload: Record<string, unknown> = { error: message };
  if (code) payload.code = code;
  if (extra) Object.assign(payload, extra);
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(1);
}

// ─── Argv parsing ────────────────────────────────────────────────────

export interface ParsedFlags {
  command: string | undefined;
  agent?: string;
  extras?: string;
  token?: string;
  skipAuth?: boolean;
  profile?: string;
  json: boolean;
  positionals: string[];
}

/**
 * Parse CLI flags from process.argv. Extracts known flags and returns
 * the command (first positional) plus remaining positionals.
 */
export function parseFlags(argv: string[]): ParsedFlags {
  const args = argv.slice(2); // skip node + script
  const flags: ParsedFlags = { command: undefined, json: false, positionals: [] };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--json') {
      flags.json = true;
      i++;
    } else if (arg === '--agent' && i + 1 < args.length) {
      flags.agent = args[++i];
      i++;
    } else if (arg === '--extras' && i + 1 < args.length) {
      flags.extras = args[++i];
      i++;
    } else if (arg === '--token' && i + 1 < args.length) {
      flags.token = args[++i];
      i++;
    } else if (arg === '--skip-auth') {
      flags.skipAuth = true;
      i++;
    } else if (arg === '--profile' && i + 1 < args.length) {
      flags.profile = args[++i];
      i++;
    } else if (!arg.startsWith('-')) {
      flags.positionals.push(arg);
      i++;
    } else {
      // Unknown flag — skip
      i++;
    }
  }

  flags.command = flags.positionals[0];
  return flags;
}
