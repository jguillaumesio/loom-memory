import fs from 'node:fs';
import crypto from 'node:crypto';

export function promptHash(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

export function withWikiFrontmatter(content, { prompt, version }) {
  const body = stripWikiFrontmatter(content).trimStart();
  return `---\nloom_prompt_hash: "${promptHash(prompt)}"\nloom_generated_at: "${new Date().toISOString()}"\nloom_version: "${version}"\n---\n\n${body}`;
}

export function readWikiFrontmatter(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    data[key] = value;
  }
  return data;
}

export function stripWikiFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n+/, '');
}

