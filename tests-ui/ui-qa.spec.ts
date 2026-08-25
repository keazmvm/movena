import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { UI_QA_SURFACES } from './surfaces';

const MINIMUM_POINTER_TARGET = 24;
const REPRESENTATIVE_SCREENSHOTS = new Set(['primitives', 'settings-controls', 'developer-hud']);
const VISUAL_COMPARISON = process.env.UI_QA_VISUAL === '1';
const THEMES = ['dark', 'light'] as const;

for (const theme of THEMES) {
for (const surface of UI_QA_SURFACES) {
  test(`${surface} (${theme}) has no accessibility or geometry violations`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`/${surface}?locale=en&theme=${theme}`);
    await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute('data-ui-qa-surface', surface);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(350);

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.document, 'document horizontal overflow').toBeLessThanOrEqual(1);
    expect(overflow.body, 'body horizontal overflow').toBeLessThanOrEqual(1);

    const undersizedTargets = await page.locator('button, a, input, [role="button"], [role="menuitem"], [role="tab"]').evaluateAll((elements, minimum) => elements
      .filter((element) => {
        const node = element as HTMLElement;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.visibility !== 'hidden'
          && style.display !== 'none'
          && rect.width > 0
          && rect.height > 0
          && !node.matches(':disabled')
          && (rect.width < minimum || rect.height < minimum);
      })
      .map((element) => {
        const node = element as HTMLElement;
        const rect = node.getBoundingClientRect();
        return `${node.tagName.toLowerCase()}[${node.getAttribute('aria-label') ?? node.textContent?.trim() ?? ''}] ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }), MINIMUM_POINTER_TARGET);
    expect(undersizedTargets, 'pointer targets smaller than 24×24 CSS pixels').toEqual([]);

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(errors).toEqual([]);

    if (theme === 'light' || REPRESENTATIVE_SCREENSHOTS.has(surface)) {
      await page.locator('[data-ui-qa-surface]').evaluate((element) => element.scrollTo(0, 0));
      await page.evaluate(() => window.scrollTo(0, 0));
      await testInfo.attach(`${surface}-${theme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      if (VISUAL_COMPARISON) {
        const snapshotName = theme === 'dark'
          ? `${surface}-${process.platform}.png`
          : `${surface}-light-${process.platform}.png`;
        await expect(page).toHaveScreenshot(snapshotName, { fullPage: true });
      }
    }
  });

  test(`${surface} (${theme}) remains contained at the 200% zoom equivalent`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 300 });
    await page.goto(`/${surface}?locale=en&theme=${theme}`);
    await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute('data-ui-qa-surface', surface);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
}

test('light preference temporarily uses the dark token contract during playback', async ({ page }) => {
  await page.goto('/primitives?locale=en&theme=light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const beforePlayback = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(beforePlayback).toEqual({ background: '#f3f6fa', colorScheme: 'light' });

  const duringPlayback = await page.evaluate(() => {
    document.documentElement.classList.add('is-playing');
    return {
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(duringPlayback).toEqual({ background: '#0b0e14', colorScheme: 'dark' });

  const afterPlayback = await page.evaluate(() => {
    document.documentElement.classList.remove('is-playing');
    return {
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(afterPlayback).toEqual(beforePlayback);
});

test('artwork-backed tags keep the high-contrast media palette in both themes', async ({ page }) => {
  const readTagStyles = async (theme: typeof THEMES[number]) => {
    await page.goto(`/content-states?locale=en&theme=${theme}`);
    return page.locator('[data-tag-type]').evaluateAll((elements) => elements.slice(0, 2).map((element) => {
      const style = getComputedStyle(element);
      return {
        type: element.getAttribute('data-tag-type'),
        color: style.color,
        background: style.backgroundColor,
      };
    }));
  };

  const dark = await readTagStyles('dark');
  const light = await readTagStyles('light');

  expect(light).toEqual(dark);
  expect(light.map(({ type }) => type)).toEqual(['gold', 'blue']);
});

for (const theme of THEMES) {
for (const surface of ['content-states', 'settings-controls'] as const) {
  test(`${surface} (${theme}) remains contained with German copy`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`/${surface}?locale=de&theme=${theme}`);
    await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute('data-ui-qa-surface', surface);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
}
