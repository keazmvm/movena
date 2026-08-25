import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { UI_QA_SURFACES } from './surfaces';

const MINIMUM_POINTER_TARGET = 24;
const REPRESENTATIVE_SCREENSHOTS = new Set(['primitives', 'settings-controls', 'developer-hud']);
const VISUAL_COMPARISON = process.env.UI_QA_VISUAL === '1';

for (const surface of UI_QA_SURFACES) {
  test(`${surface} has no accessibility or geometry violations`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`/${surface}?locale=en`);
    await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute('data-ui-qa-surface', surface);

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

    if (REPRESENTATIVE_SCREENSHOTS.has(surface)) {
      await page.locator('[data-ui-qa-surface]').evaluate((element) => element.scrollTo(0, 0));
      await testInfo.attach(`${surface}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      if (VISUAL_COMPARISON) {
        await expect(page).toHaveScreenshot(`${surface}-${process.platform}.png`, { fullPage: true });
      }
    }
  });

  test(`${surface} remains contained at the 200% zoom equivalent`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 300 });
    await page.goto(`/${surface}?locale=en`);
    await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute('data-ui-qa-surface', surface);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

for (const surface of ['content-states', 'settings-controls'] as const) {
  test(`${surface} remains contained with German copy`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`/${surface}?locale=de`);
    await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute('data-ui-qa-surface', surface);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
