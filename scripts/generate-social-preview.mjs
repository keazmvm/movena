import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const assetDir = path.join(projectRoot, '.github', 'assets', 'readme');

const asDataUrl = async (filePath, mimeType) => {
  const contents = await readFile(filePath);
  return `data:${mimeType};base64,${contents.toString('base64')}`;
};

const [heroUrl, wordmarkFontUrl] = await Promise.all([
  asDataUrl(path.join(assetDir, 'hero.webp'), 'image/webp'),
  asDataUrl(path.join(projectRoot, 'public', 'fonts', 'righteous-latin-400.woff2'), 'font/woff2'),
]);

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "Righteous";
        src: url("${wordmarkFontUrl}") format("woff2");
        font-weight: 400;
      }

      * { box-sizing: border-box; }

      html, body {
        width: 1280px;
        height: 640px;
        margin: 0;
        overflow: hidden;
        background: #05080d;
        color: #f7fbff;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .card {
        position: relative;
        width: 1280px;
        height: 640px;
        overflow: hidden;
        background:
          radial-gradient(circle at 75% 45%, rgba(0, 139, 255, 0.2), transparent 43%),
          #05080d;
      }

      .top-rule {
        position: absolute;
        z-index: 8;
        top: 0;
        left: 0;
        width: 100%;
        height: 8px;
        background: linear-gradient(90deg, #0588ff 0%, #48b8ff 33%, #0588ff 67%, #0063bd 100%);
      }

      .content {
        position: absolute;
        z-index: 6;
        top: 49px;
        left: 48px;
        width: 360px;
      }

      .eyebrow {
        color: #65b9ff;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 2.1px;
        text-transform: uppercase;
      }

      .wordmark {
        margin-top: 14px;
        font-family: "Righteous", sans-serif;
        font-size: 49px;
        font-weight: 400;
        letter-spacing: 8px;
        line-height: 1;
      }

      h1 {
        margin: 52px 0 0;
        font-size: 47px;
        font-weight: 850;
        letter-spacing: -3px;
        line-height: 0.96;
        text-transform: uppercase;
      }

      h1 span { color: #2da4ff; }

      .description {
        width: 350px;
        margin: 22px 0 0;
        color: #b5c2d0;
        font-size: 17px;
        font-weight: 500;
        line-height: 1.48;
      }

      .features {
        display: flex;
        margin-top: 25px;
        color: #dfeaff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1px;
        text-transform: uppercase;
      }

      .features span + span::before {
        margin: 0 10px;
        color: #277fc1;
        content: "/";
      }

      .preview-shadow {
        position: absolute;
        z-index: 1;
        top: 84px;
        right: 22px;
        width: 830px;
        height: 510px;
        background: #008dff;
        filter: blur(68px);
        opacity: 0.3;
      }

      .preview {
        position: absolute;
        z-index: 3;
        top: 62px;
        right: 28px;
        width: 824px;
        height: 515px;
        overflow: hidden;
        border: 1px solid rgba(129, 199, 255, 0.5);
        border-radius: 14px;
        background: #080c12;
        box-shadow:
          -20px 30px 70px rgba(0, 0, 0, 0.7),
          0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      }

      .preview img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .preview::after {
        position: absolute;
        inset: 0;
        content: "";
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.035);
        pointer-events: none;
      }

      .footer {
        position: absolute;
        z-index: 7;
        bottom: 38px;
        left: 48px;
        color: #718299;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.6px;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="top-rule"></div>
      <div class="preview-shadow"></div>
      <div class="preview"><img src="${heroUrl}" alt="" /></div>
      <section class="content">
        <div class="eyebrow">Open-source desktop IPTV</div>
        <div class="wordmark">MOVENA</div>
        <h1>A proper<br />home for<br /><span>your IPTV.</span></h1>
        <p class="description">Live TV, movies and series from Xtream or M3U—without an account or telemetry.</p>
        <div class="features"><span>Xtream</span><span>M3U</span><span>XMLTV</span><span>libmpv</span></div>
      </section>
      <div class="footer">movena.frtx.cc · Windows · macOS · Linux</div>
    </main>
  </body>
</html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(assetDir, 'social-preview.png'),
    type: 'png',
    animations: 'disabled',
  });
} finally {
  await browser.close();
}

console.log('Generated .github/assets/readme/social-preview.png (1280×640).');
