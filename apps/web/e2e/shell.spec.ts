import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** App-Shell nach dem Design System: Tab-Leiste mit Hauptaktion mobil, Seitenleiste und Befehlspalette am Desktop. */
test.describe('Shell mobil (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Lehrkraft: fünf Tabs, Klassenbuch als Hauptaktion, Mehr öffnet ein Sheet', async ({
    page,
  }) => {
    await login(page, accounts().teacherEmail, /\/heute$/);
    const tabs = page.locator('nav.pf-tabbar');
    await expect(tabs).toBeVisible();
    await expect(tabs.locator('.pf-tab')).toHaveCount(5);
    await expect(tabs.locator('.pf-tab--primary')).toContainText('Klassenbuch');
    await expect(tabs.getByRole('link', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav.pf-nav')).toBeHidden();

    await tabs.getByRole('button', { name: 'Mehr' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mehr' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Prüfungen/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Abmelden' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await tabs.locator('.pf-tab--primary').click();
    await expect(page).toHaveURL(/\/klassenbuch/);
  });
});

test.describe('Shell Desktop (1280 px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Direktion: Seitenleiste mit Abschnitt Schule, Befehlspalette mit Strg+K', async ({
    page,
  }) => {
    await login(page, accounts().principalEmail, /\/lagebild$/);
    const side = page.locator('nav.pf-nav');
    await expect(side).toBeVisible();
    await expect(page.locator('nav.pf-tabbar')).toBeHidden();
    await expect(side.getByText('Schule', { exact: true })).toBeVisible();
    await expect(side.getByRole('link', { name: /Lagebild/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Seite suchen' });
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('rundschr');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/rundschreiben$/);
  });
});
