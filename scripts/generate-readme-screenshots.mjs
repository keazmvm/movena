import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startScreenshotHarness, waitForPageAssets } from './screenshot-harness.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const assetDir = path.join(projectRoot, '.github', 'assets', 'readme');
const surfaces = [
  'hero',
  'live-tv',
  'live-epg',
  'player-vod',
  'player-series',
  'library-details',
  'series-details',
  'upcoming',
  'search',
  'm3u-editor',
  'm3u-raw-editor',
  'downloads',
  'settings',
  'playback-settings',
  'light-theme',
];

await mkdir(assetDir, { recursive: true });

const harness = await startScreenshotHarness(projectRoot);

let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  for (const surface of surfaces) {
    await page.goto(`${harness.baseUrl}/?readme=${encodeURIComponent(surface)}`, {
      waitUntil: 'networkidle',
    });
    await waitForPageAssets(page, 250);

    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 90,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const target = path.join(assetDir, `${surface}.webp`);
    await writeFile(target, Buffer.from(capture.data, 'base64'));
    console.log(`Generated ${path.relative(projectRoot, target)} (1440x900).`);
  }
} catch (error) {
  harness.writeOutput();
  throw error;
} finally {
  if (browser) await browser.close();
  harness.stop();
}
