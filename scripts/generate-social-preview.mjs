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
  asDataUrl(
    path.join(projectRoot, 'public', 'fonts', 'righteous-latin-400.woff2'),
    'font/woff2',
  ),
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
        font-style: normal;
      }

      * { box-sizing: border-box; }

      html,
      body {
        width: 1280px;
        height: 640px;
        margin: 0;
        overflow: hidden;
        background: #050912;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        color: #f8fbff;
      }

      .card {
        position: relative;
        width: 1280px;
        height: 640px;
        isolation: isolate;
        overflow: hidden;
        background:
          radial-gradient(circle at 84% 30%, rgba(26, 132, 255, 0.31), transparent 31%),
          radial-gradient(circle at 42% 104%, rgba(61, 71, 255, 0.2), transparent 34%),
          linear-gradient(122deg, #060b15 0%, #07111f 53%, #071425 100%);
      }

      .card::before {
        position: absolute;
        inset: 0;
        z-index: -1;
        content: "";
        opacity: 0.32;
        background-image:
          linear-gradient(rgba(130, 184, 255, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(130, 184, 255, 0.08) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: linear-gradient(90deg, black, transparent 69%);
      }

      .beam {
        position: absolute;
        top: -310px;
        right: -190px;
        width: 780px;
        height: 780px;
        border: 1px solid rgba(89, 173, 255, 0.22);
        border-radius: 50%;
        box-shadow:
          0 0 0 76px rgba(25, 116, 229, 0.035),
          0 0 0 150px rgba(25, 116, 229, 0.028);
      }

      .content {
        position: absolute;
        z-index: 4;
        top: 62px;
        left: 64px;
        width: 520px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        height: 30px;
        padding: 0 13px;
        border: 1px solid rgba(84, 168, 255, 0.35);
        border-radius: 999px;
        background: rgba(8, 38, 73, 0.58);
        color: #9dceff;
        font-size: 12px;
        font-weight: 760;
        letter-spacing: 1.55px;
        text-transform: uppercase;
        box-shadow: inset 0 0 18px rgba(5, 114, 229, 0.08);
      }

      .eyebrow::before {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #28a4ff;
        content: "";
        box-shadow: 0 0 13px #168fff;
      }

      .brand {
        display: flex;
        align-items: center;
        margin-top: 31px;
      }

      .wordmark {
        margin-top: -3px;
        font-family: "Righteous", sans-serif;
        font-size: 57px;
        font-weight: 400;
        letter-spacing: 7px;
        line-height: 1;
        text-shadow: 0 0 32px rgba(86, 171, 255, 0.2);
      }

      h1 {
        max-width: 500px;
        margin: 37px 0 0;
        font-size: 49px;
        font-weight: 790;
        letter-spacing: -2.25px;
        line-height: 1.01;
      }

      h1 span {
        color: #62b0ff;
        text-shadow: 0 0 36px rgba(27, 139, 255, 0.28);
      }

      .description {
        width: 470px;
        margin-top: 20px;
        color: #b9c8d9;
        font-size: 18px;
        font-weight: 480;
        letter-spacing: -0.2px;
        line-height: 1.47;
      }

      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 27px;
      }

      .pill {
        height: 31px;
        padding: 0 12px;
        border: 1px solid rgba(141, 181, 225, 0.18);
        border-radius: 8px;
        background: rgba(16, 27, 44, 0.72);
        color: #dbe9f8;
        font-size: 12px;
        font-weight: 680;
        line-height: 29px;
      }

      .url {
        position: absolute;
        bottom: 42px;
        left: 65px;
        z-index: 5;
        color: #7f93aa;
        font-size: 14px;
        font-weight: 620;
        letter-spacing: 0.5px;
      }

      .preview-glow {
        position: absolute;
        z-index: 1;
        top: 109px;
        right: -25px;
        width: 720px;
        height: 470px;
        border-radius: 50%;
        background: rgba(0, 115, 237, 0.25);
        filter: blur(70px);
        transform: rotate(-3deg);
      }

      .preview {
        position: absolute;
        z-index: 3;
        top: 105px;
        right: -79px;
        width: 730px;
        height: 456px;
        overflow: hidden;
        border: 1px solid rgba(121, 190, 255, 0.36);
        border-radius: 20px;
        background: #070c14;
        transform: perspective(1200px) rotateY(-5deg) rotateZ(-1.6deg);
        transform-origin: center center;
        box-shadow:
          0 42px 90px rgba(0, 0, 0, 0.58),
          0 0 0 1px rgba(255, 255, 255, 0.045) inset,
          0 0 65px rgba(14, 119, 240, 0.15);
      }

      .preview::after {
        position: absolute;
        inset: 0;
        content: "";
        pointer-events: none;
        background:
          linear-gradient(118deg, rgba(255, 255, 255, 0.07), transparent 22%, transparent 77%),
          linear-gradient(180deg, transparent 72%, rgba(0, 0, 0, 0.1));
      }

      .preview img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .privacy-card {
        position: absolute;
        z-index: 5;
        right: 46px;
        bottom: 45px;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 222px;
        height: 56px;
        padding: 0 17px;
        border: 1px solid rgba(113, 186, 255, 0.3);
        border-radius: 15px;
        background: rgba(8, 18, 32, 0.88);
        backdrop-filter: blur(15px);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.42);
      }

      .shield {
        position: relative;
        width: 29px;
        height: 34px;
        flex: 0 0 auto;
        clip-path: polygon(50% 0, 91% 16%, 86% 67%, 50% 100%, 14% 67%, 9% 16%);
        background: linear-gradient(180deg, #37a8ff, #076ee0);
        filter: drop-shadow(0 0 10px rgba(39, 157, 255, 0.4));
      }

      .shield::after {
        position: absolute;
        top: 9px;
        left: 9px;
        width: 10px;
        height: 6px;
        border-bottom: 3px solid white;
        border-left: 3px solid white;
        content: "";
        transform: rotate(-45deg);
      }

      .privacy-copy strong {
        display: block;
        color: #f3f8ff;
        font-size: 14px;
        line-height: 1.15;
      }

      .privacy-copy span {
        display: block;
        margin-top: 4px;
        color: #8fa3ba;
        font-size: 11px;
        font-weight: 540;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="beam"></div>
      <div class="content">
        <div class="eyebrow">Open source desktop player</div>
        <div class="brand">
          <div class="wordmark">MOVENA</div>
        </div>
        <h1>Your IPTV.<br /><span>Your library.</span><br />Your player.</h1>
        <p class="description">
          Xtream Codes, M3U/M3U8 and XMLTV EPG—powered by native libmpv.
        </p>
        <div class="pills">
          <span class="pill">Windows</span>
          <span class="pill">macOS</span>
          <span class="pill">Linux</span>
          <span class="pill">GPL-3.0</span>
        </div>
      </div>
      <div class="preview-glow"></div>
      <div class="preview"><img src="${heroUrl}" alt="" /></div>
      <div class="privacy-card">
        <div class="shield"></div>
        <div class="privacy-copy">
          <strong>Private by design</strong>
          <span>No account · No telemetry</span>
        </div>
      </div>
      <div class="url">movena.frtx.cc</div>
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
