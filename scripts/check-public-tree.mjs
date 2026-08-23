import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const output = execFileSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z',
], { cwd: projectRoot, encoding: 'utf8' });
const files = output.split('\0').filter(Boolean).filter((file) => existsSync(resolve(projectRoot, file)));
const failures = [];
const playlistExtensions = new Set(['.m3u', '.m3u8', '.xspf', '.xmltv']);
const binaryMediaExtensions = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.mp3', '.flac']);
const allowedPlaylist = /^tests\/fixtures\/[a-z0-9._-]+\.m3u8?$/i;
const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['credential URL', /https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/i],
];

for (const file of files) {
  const normalized = file.replace(/\\/g, '/');
  const extension = extname(normalized).toLowerCase();
  if (playlistExtensions.has(extension) && !allowedPlaylist.test(normalized)) {
    failures.push(`${normalized}: private playlist formats are not permitted`);
  }
  if (binaryMediaExtensions.has(extension)) {
    failures.push(`${normalized}: bundled audio/video requires an explicit release exception`);
  }
  const absolute = resolve(projectRoot, file);
  if (statSync(absolute).size > 2 * 1024 * 1024) continue;
  let text;
  try { text = readFileSync(absolute, 'utf8'); } catch { continue; }
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) failures.push(`${relative(projectRoot, absolute)}: possible ${label}`);
  }
}

if (failures.length) {
  console.error('Public-tree compliance check failed:\n' + failures.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Public-tree compliance check passed (${files.length} files).`);
