import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const assetDir = path.join(projectRoot, '.github', 'assets', 'readme');
const surfaces = [
  'hero',
  'live-tv',
  'live-epg',
  'player-vod',
  'library-details',
  'series-details',
  'search',
  'm3u-editor',
  'downloads',
  'settings',
  'playback-settings',
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
  if (!port) throw new Error('Could not reserve a local port for the screenshot harness.');
  return port;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/?readme=hero`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the README screenshot harness.');
}

await mkdir(assetDir, { recursive: true });

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

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch();
  const context = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  for (const surface of surfaces) {
    await page.goto(`${baseUrl}/?readme=${encodeURIComponent(surface)}`, {
      waitUntil: 'networkidle',
    });
    await page.locator('#root').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => undefined)));
    });
    await page.waitForTimeout(250);

    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 84,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const target = path.join(assetDir, `${surface}.webp`);
    await writeFile(target, Buffer.from(capture.data, 'base64'));
    console.log(`Generated ${path.relative(projectRoot, target)} (1440x900).`);
  }
} catch (error) {
  if (serverOutput.trim()) process.stderr.write(serverOutput);
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill();
}
