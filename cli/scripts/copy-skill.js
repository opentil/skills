// Copies skills/til/ into cli/templates/skill/ for npm packaging
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', '..', 'skills', 'til');
const dest = join(__dirname, '..', 'templates', 'skill');

// Clean and copy
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log('Copied skills/til/ → cli/templates/skill/');
