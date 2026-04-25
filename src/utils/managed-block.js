import fs from 'node:fs';

const START = '<!-- LOOM:GENERATED:START -->';
const END = '<!-- LOOM:GENERATED:END -->';

/**
 * Write a managed block to a file.
 *
 * - File missing → create with [header][START][generated][END]
 * - File has markers → replace only between markers
 * - File exists, no markers → append [\n\nSTART\ngenerated\nEND] to end
 *
 * Returns: 'created' | 'replaced' | 'appended'
 */
export function writeManagedBlock(filePath, generated, { header = '' } = {}) {
  const block = `${START}\n${generated.trimEnd()}\n${END}`;

  if (!fs.existsSync(filePath)) {
    const content = header
      ? `${header.trimEnd()}\n\n${block}\n`
      : `${block}\n`;
    fs.writeFileSync(filePath, content);
    return 'created';
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const startIdx = existing.indexOf(START);
  const endIdx = existing.indexOf(END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + END.length);
    fs.writeFileSync(filePath, `${before}${block}${after}`);
    return 'replaced';
  }

  // Markers missing → append, do not overwrite
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(filePath, `${existing}${sep}${block}\n`);
  return 'appended';
}

export function hasManagedBlock(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const c = fs.readFileSync(filePath, 'utf8');
  return c.includes(START) && c.includes(END);
}
