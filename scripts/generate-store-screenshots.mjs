import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'docs', 'distribution', 'screenshots');
await mkdir(outDir, { recursive: true });

const surfaces = [
  { id: 'hero', name: '01_Home_Dashboard.png' },
  { id: 'live-tv', name: '02_Live_TV_Player.png' },
  { id: 'live-epg', name: '03_Electronic_Program_Guide.png' },
  { id: 'library-details', name: '04_Movie_Details.png' },
  { id: 'm3u-editor', name: '05_M3U_Playlist_Editor.png' },
  { id: 'settings', name: '06_Settings_Theme.png' },
];

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolve) => probe.close(resolve));
  if (!port) throw new Error('Could not reserve a local port.');
  return port;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/?readme=hero`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for server.');
}

const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [
  viteBin,
  '--config',
  path.join(projectRoot, 'vite.ui-qa.config.ts'),
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--strictPort',
], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch();
  const context = await browser.newContext({
    colorScheme: 'dark',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  for (const surface of surfaces) {
    await page.goto(`${baseUrl}/?readme=${encodeURIComponent(surface.id)}`, {
      waitUntil: 'networkidle',
    });
    await page.locator('#root').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (img) => img.decode().catch(() => undefined)));
    });
    await page.waitForTimeout(300);

    const target = path.join(outDir, surface.name);
    await page.screenshot({ path: target, type: 'png' });
    console.log(`Generated screenshot: ${surface.name}`);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log('All store screenshots generated successfully!');
