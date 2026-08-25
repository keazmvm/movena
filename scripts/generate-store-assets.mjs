import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'distribution', 'store-assets');
await mkdir(outDir, { recursive: true });

const iconBase64 = (await readFile(path.join(root, 'src-tauri', 'icons', 'icon.png'))).toString('base64');
const iconSrc = `data:image/png;base64,${iconBase64}`;

const browser = await chromium.launch();

async function renderAsset(fileName, width, height, iconSize) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: ${width}px;
            height: ${height}px;
            background: #090a0f;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          img {
            width: ${iconSize}px;
            height: ${iconSize}px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <img src="${iconSrc}" />
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForLoadState('networkidle');
  const target = path.join(outDir, fileName);
  await page.screenshot({ path: target, type: 'png' });
  console.log(`Generated: ${fileName} (${width}x${height})`);
  await page.close();
}

// 1:1 Box Art (1080x1080)
await renderAsset('BoxArt_1080x1080.png', 1080, 1080, 600);
// 2:3 Poster Art (720x1080)
await renderAsset('PosterArt_720x1080.png', 720, 1080, 480);
// 1:1 App Tile Icon (300x300)
await renderAsset('AppTile_300x300.png', 300, 300, 240);
// 1:1 150x150
await renderAsset('Logo_150x150.png', 150, 150, 120);
// 1:1 71x71
await renderAsset('Logo_71x71.png', 71, 71, 56);

await browser.close();
console.log('All store assets generated in docs/distribution/store-assets/');
