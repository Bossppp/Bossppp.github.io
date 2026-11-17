#!/usr/bin/env node
/**
 * Renders the two files that cannot be written by hand.
 *
 *   node scripts/render.mjs cv                     cv/index.html -> cv/Peerawit-Seemamahawong-CV.pdf
 *   node scripts/render.mjs cv --phone "08x ..."   same, with a phone number in the contact line
 *                              --out ~/cv.pdf      write somewhere outside the repository
 *   node scripts/render.mjs og                     scripts/og.html -> assets/og.jpg
 *
 * Needs Playwright, which the site itself does not:
 *   npm install --no-save playwright && npx playwright install chromium
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (...parts) => path.join(root, ...parts);

const A4_HEIGHT_PX = (297 / 25.4) * 96; // CSS pixels are 1/96 inch

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    phone: { type: 'string' },
    out: { type: 'string' },
  },
});

const targets = {
  /** @param {import('playwright').Page} page */
  async cv(page) {
    const out = path.resolve(values.out ?? fromRoot('cv', 'Peerawit-Seemamahawong-CV.pdf'));
    if (values.phone && !values.out) {
      // The default path is published with the site. A phone number does not belong there.
      throw new Error('--phone needs --out, so the copy with your number is not written into the repository.');
    }

    await page.goto(pathToFileURL(fromRoot('cv', 'index.html')).href);
    await page.emulateMedia({ media: 'print' });
    if (values.phone) {
      await page.locator('[data-slot="phone"]').evaluate((slot, phone) => {
        slot.textContent = phone;
        slot.hidden = false;
      }, values.phone);
    }
    await page.evaluate(() => document.fonts.ready);

    // A CV that quietly grows a second page is worse than a failed build.
    const height = await page.locator('.sheet').evaluate((sheet) => sheet.scrollHeight);
    if (height > Math.ceil(A4_HEIGHT_PX)) {
      throw new Error(`The CV is ${Math.round(height - A4_HEIGHT_PX)}px too tall for one A4 page. Trim it and run again.`);
    }

    await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
    return out;
  },

  /** @param {import('playwright').Page} page */
  async og(page) {
    const out = fromRoot('assets', 'og.jpg');
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto(pathToFileURL(fromRoot('scripts', 'og.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
    return out;
  },
};

const render = targets[positionals[0]];
if (!render) {
  console.error(`Usage: node scripts/render.mjs <${Object.keys(targets).join('|')}> [--phone "..."] [--out file]`);
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const written = await render(await browser.newPage());
  console.log(`Wrote ${path.relative(process.cwd(), written)}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
