import fs from 'node:fs';
import path from 'node:path';

export function sectionMarkers(sectionId) {
  return {
    start: `<!-- LOOM:SECTION:START:${sectionId} -->`,
    end: `<!-- LOOM:SECTION:END:${sectionId} -->`,
  };
}

export function replaceSection(filePath, sectionId, newContent, { title } = {}) {
  const { start, end } = sectionMarkers(sectionId);
  const body = newContent.trim();
  const heading = title ? `\n\n## ${title}\n\n` : '\n\n';
  const block = `${start}${heading}${body}\n${end}`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${block}\n`, 'utf8');
    return 'created';
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const startIdx = existing.indexOf(start);
  const endIdx = existing.indexOf(end);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + end.length);
    fs.writeFileSync(filePath, `${before}${block}${after}`, 'utf8');
    return 'replaced';
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(filePath, `${existing}${sep}${block}\n`, 'utf8');
  return 'appended';
}
