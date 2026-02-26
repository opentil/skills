const RESET = '\x1b[0m';
const DIM = '\x1b[38;5;102m';

// Matches the brand from til CLI (internal/brand/brand.go)
const LOGO_LINES = [
  '  ___                      _____ ___ _',
  ' / _ \\ _ __   ___ _ __    |_   _|_ _| |',
  '| | | | \'_ \\ / _ \\ \'_ \\     | |  | || |',
  '| |_| | |_) |  __/ | | |    | |  | || |___',
  ' \\___/| .__/ \\___|_| |_|    |_| |___|_____|',
  '      |_|',
];

// 256-color grays — visible on both light and dark backgrounds
const GRAYS = [
  '\x1b[38;5;250m',
  '\x1b[38;5;249m',
  '\x1b[38;5;247m',
  '\x1b[38;5;244m',
  '\x1b[38;5;241m',
  '\x1b[38;5;238m',
];

const TAGLINE = 'Capture in the flow. Your AI grows with every insight.';

export function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}${RESET}`);
  });
  console.log();
  console.log(`  ${DIM}${TAGLINE}${RESET}`);
}
