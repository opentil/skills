import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextFile, writeTextFile, removeFile } from '../utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveTemplate(name: string): string {
  const candidates = [
    join(__dirname, '..', '..', 'templates', name),     // from cli/src or cli/dist
    join(__dirname, '..', 'templates', name),            // fallback
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  throw new Error(`Template not found: ${name}`);
}

const OPENTIL_START = '<!-- opentil:start -->';
const OPENTIL_END = '<!-- opentil:end -->';

const DEFAULT_PREFIX = '/til';

function replaceCommandPrefix(content: string, prefix: string): string {
  return content.replace(/\/til(?=[^a-zA-Z0-9_]|$)/g, prefix);
}

export function installAgentMdSection(agentMdPath: string, commandPrefix?: string): void {
  let section = resolveTemplate('agent-md-section.md');
  if (commandPrefix != null && commandPrefix !== DEFAULT_PREFIX) {
    section = replaceCommandPrefix(section, commandPrefix);
  }

  let content = readTextFile(agentMdPath);
  if (content === null) {
    // Create new file with just the section
    writeTextFile(agentMdPath, section);
    return;
  }

  // Check if section already exists
  if (content.includes(OPENTIL_START)) {
    // Replace existing section
    const startIdx = content.indexOf(OPENTIL_START);
    const endIdx = content.indexOf(OPENTIL_END);
    if (endIdx !== -1) {
      content = content.slice(0, startIdx) + section + content.slice(endIdx + OPENTIL_END.length);
      writeTextFile(agentMdPath, content);
    }
    return;
  }

  // Append section
  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  writeTextFile(agentMdPath, content + separator + section);
}

export function uninstallAgentMdSection(agentMdPath: string): void {
  const content = readTextFile(agentMdPath);
  if (!content || !content.includes(OPENTIL_START)) return;

  const startIdx = content.indexOf(OPENTIL_START);
  const endIdx = content.indexOf(OPENTIL_END);
  if (endIdx === -1) return;

  // Remove the section and any surrounding blank lines
  let before = content.slice(0, startIdx);
  let after = content.slice(endIdx + OPENTIL_END.length);

  // Clean up extra newlines
  before = before.replace(/\n\n$/, '\n');
  after = after.replace(/^\n\n/, '\n');

  const result = (before + after).trim();
  if (result.length === 0) {
    removeFile(agentMdPath);
  } else {
    writeTextFile(agentMdPath, result + '\n');
  }
}
