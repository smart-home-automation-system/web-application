import { expect, startIn, test } from './support';

/**
 * The requests of the household (HAS-411), on a page of their own for every member since HAS-438 (they
 * were a card of My room before), as two cards (owner 2026-11-13): "Requests for you" - the list of the
 * member - and "Your requests for the others" - what the member wrote for the others and the form for a new
 * one, fed by the mock API.
 */

// HAS-411: the household requests (database-service 0.22.0) - the list of the member, written for anybody
test.describe('the requests of the household', () => {
  test('lists what waits for the member, with who wrote it and whether the SMS went', async ({
    page,
  }) => {
    await page.goto('/requests');
    const card = page.getByTestId('my-requests');

    await expect(card.getByText('Requests for you', { exact: true })).toBeVisible();
    const open = card.getByTestId('open-requests').getByRole('listitem');
    await expect(open).toHaveCount(2);
    await expect(open.first()).toContainText('Bread and milk');
    await expect(open.first()).toContainText('texted');
    await expect(open.nth(1)).toContainText('Batteries for the remote');
    await expect(open.nth(1)).toContainText('from Borys');
    await expect(open.nth(1)).toContainText('goes by SMS at 08:00');

    await card.getByTestId('done-toggle').click();
    await expect(card.getByTestId('done-requests')).toContainText('Take the parcel');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('ticks a request off and removes another, reading the list back', async ({ page }) => {
    await page.goto('/requests');
    const card = page.getByTestId('my-requests');
    const open = card.getByTestId('open-requests').getByRole('listitem');
    await expect(open).toHaveCount(2);

    await open.filter({ hasText: 'Batteries' }).getByRole('button', { name: 'Done' }).click();
    await expect(open).toHaveCount(1);
    await card.getByTestId('done-toggle').click();
    await expect(card.getByTestId('done-requests')).toContainText('Batteries for the remote');

    await open.getByRole('button', { name: 'Remove the request' }).click();
    await expect(card.getByTestId('no-requests')).toHaveText('Nothing is waiting for you.');
  });

  test('writes a request for another member and one for oneself', async ({ page }) => {
    await page.goto('/requests');
    const mine = page.getByTestId('my-requests');
    const others = page.getByTestId('written-card');
    await expect(mine.getByTestId('open-requests').getByRole('listitem')).toHaveCount(2);

    // a blank text is refused before anything is sent
    await others.getByRole('button', { name: 'Add' }).click();
    await expect(others.getByText('Write what is needed.')).toBeVisible();

    // the first other member is chosen
    await expect(others.getByRole('combobox', { name: 'For' })).toContainText('Borys');
    await others.getByLabel('What is needed').fill('Light bulbs');
    await others.getByLabel('What is needed').press('Enter');
    await expect(others.getByTestId('request-added')).toHaveText('Added to the list of Borys');
    await expect(others.getByLabel('What is needed')).toHaveValue('');
    await expect(mine.getByTestId('open-requests').getByRole('listitem')).toHaveCount(2);
    // what was written for Borys shows at once in what Aurelia wrote for the others, on top
    const written = others.getByTestId('written-open').getByRole('listitem');
    await expect(written).toHaveCount(2);
    await expect(written.first()).toContainText('Light bulbs');
    await expect(written.first()).toContainText('for Borys');

    await others.getByRole('combobox', { name: 'For' }).click();
    await page.getByRole('option', { name: 'Aurelia' }).click();
    await others.getByLabel('What is needed').fill('Coffee');
    await others.getByRole('button', { name: 'Add' }).click();
    await expect(mine.getByTestId('open-requests').getByRole('listitem')).toHaveCount(3);
    await expect(mine.getByTestId('open-requests')).toContainText('Coffee');
    await expect(written).toHaveCount(2);
  });

  test('shows what the member wrote for the others and removes one of them', async ({ page }) => {
    await page.goto('/requests');
    const others = page.getByTestId('written-card');
    const section = others.getByTestId('written-requests');

    await expect(others.getByText('Your requests for the others', { exact: true })).toBeVisible();
    const written = section.getByTestId('written-open').getByRole('listitem');
    await expect(written).toHaveCount(1);
    await expect(written.first()).toContainText('Light bulbs for the hall');
    await expect(written.first()).toContainText('for Celina');
    await expect(written.first()).toContainText('goes by SMS at 08:00');

    await section.getByTestId('written-done-toggle').click();
    await expect(section.getByTestId('written-done')).toContainText('Stamps');
    await expect(section.getByTestId('written-done')).toContainText('by Celina');

    await written.getByRole('button', { name: 'Remove the request' }).click();
    await expect(section.getByTestId('written-none')).toHaveText(
      'Nothing you wrote for the others is waiting.',
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // a list opened on one card moves nothing on the other (owner 2026-11-13)
  test('keeps the buttons that fold the lists in place when one opens', async ({ page }, testInfo) => {
    // side by side only: on a phone the second card stands under the first and moves with it
    test.skip(testInfo.project.name === 'phone', 'the cards stand one under the other');
    await page.goto('/requests');
    const toggles = [
      page.getByTestId('my-requests').getByTestId('done-toggle'),
      page.getByTestId('written-card').getByTestId('written-done-toggle'),
    ];
    await expect(toggles[1]).toBeVisible();
    const before = await Promise.all(toggles.map(async (toggle) => (await toggle.boundingBox())!.y));

    await toggles[0].click();
    await toggles[1].click();

    const after = await Promise.all(toggles.map(async (toggle) => (await toggle.boundingBox())!.y));
    expect(after).toEqual(before);
  });

  test('reads in Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/requests');
    const mine = page.getByTestId('my-requests');
    const others = page.getByTestId('written-card');

    await expect(mine.getByText('Prośby do Ciebie', { exact: true })).toBeVisible();
    await expect(mine).toContainText('od: Borys');
    await expect(mine).toContainText('pójdzie SMS-em o 8:00');
    await expect(others.getByText('Twoje prośby do innych', { exact: true })).toBeVisible();
    await expect(others).toContainText('dla: Celina');
  });
});
