import { expect, startIn, test } from './support';

/**
 * The requests of the household (HAS-411), on a page of their own for every member since HAS-438 (they
 * were a card of My room before): the list of the member, the requests written for the others and the
 * form for a new one, fed by the mock API.
 */

// HAS-411: the household requests (database-service 0.22.0) - the list of the member, written for anybody
test.describe('the requests of the household', () => {
  test('lists what waits for the member, with who wrote it and whether the SMS went', async ({
    page,
  }) => {
    await page.goto('/requests');
    const card = page.getByTestId('my-requests');

    await expect(card.getByText('Requests', { exact: true })).toBeVisible();
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
    const card = page.getByTestId('my-requests');
    await expect(card.getByTestId('open-requests').getByRole('listitem')).toHaveCount(2);

    // a blank text is refused before anything is sent
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.getByText('Write what is needed.')).toBeVisible();

    await card.getByRole('combobox', { name: 'For' }).click();
    await page.getByRole('option', { name: 'Borys' }).click();
    await card.getByLabel('What is needed').fill('Light bulbs');
    await card.getByLabel('What is needed').press('Enter');
    await expect(card.getByTestId('request-added')).toHaveText('Added to the list of Borys');
    await expect(card.getByLabel('What is needed')).toHaveValue('');
    await expect(card.getByTestId('open-requests').getByRole('listitem')).toHaveCount(2);
    // what was written for Borys shows at once in what Aurelia wrote for the others, on top
    const written = card.getByTestId('written-open').getByRole('listitem');
    await expect(written).toHaveCount(2);
    await expect(written.first()).toContainText('Light bulbs');
    await expect(written.first()).toContainText('for Borys');

    await card.getByRole('combobox', { name: 'For' }).click();
    await page.getByRole('option', { name: 'Aurelia' }).click();
    await card.getByLabel('What is needed').fill('Coffee');
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.getByTestId('open-requests').getByRole('listitem')).toHaveCount(3);
    await expect(card.getByTestId('open-requests')).toContainText('Coffee');
    await expect(written).toHaveCount(2);
  });

  test('shows what the member wrote for the others and removes one of them', async ({ page }) => {
    await page.goto('/requests');
    const section = page.getByTestId('my-requests').getByTestId('written-requests');

    await expect(section.getByText('Written by you for the others')).toBeVisible();
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

  test('reads in Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/requests');
    const card = page.getByTestId('my-requests');

    await expect(card.getByText('Zapotrzebowania', { exact: true })).toBeVisible();
    await expect(card).toContainText('od: Borys');
    await expect(card).toContainText('pójdzie SMS-em o 8:00');
    await expect(card.getByText('Wpisane przez Ciebie dla innych')).toBeVisible();
    await expect(card).toContainText('dla: Celina');
  });
});
