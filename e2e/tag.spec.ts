import { expect, startIn, test } from './support';

// the mock tags of src/mocks/appliances.fixtures.ts: the washing machine runs, the dryer has finished
// and waits; any MAC but 0000000000000000 stands for one the key gives
const DRYER = '/t?picc_data=62000000000000000000000000000062&cmac=1111111111111111';
const WASHING_MACHINE = '/t?picc_data=61000000000000000000000000000061&cmac=2222222222222222';
const FORGED = '/t?picc_data=62000000000000000000000000000062&cmac=0000000000000000';

/** The page an NFC tag on an appliance opens (HAS-346), on the mock API. */
test.describe('a member this browser remembers', () => {
  test.use({ profile: 'resident' });

  test('holds the phone to the tag of a finished appliance and sees it recorded', async ({
    page,
  }) => {
    await page.goto(DRYER);

    const done = page.getByTestId('tag-done');
    await expect(done).toContainText('Dryer');
    await expect(done).toContainText('emptied');
    await expect(done).toContainText('Recorded for Borys');
    // no navigation on this page, and the read is gone from the address
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page).toHaveURL(/\/t$/);
  });

  test('is told when nothing waits', async ({ page }) => {
    await page.goto(WASHING_MACHINE);

    await expect(page.getByTestId('tag-failed').getByRole('alert')).toContainText(
      'Nothing waits: this appliance has not finished a cycle in the last 12 hours.',
    );
  });

  test('is told when the read cannot be checked', async ({ page }) => {
    await page.goto(FORGED);

    await expect(page.getByTestId('tag-failed').getByRole('alert')).toContainText(
      'This read cannot be checked.',
    );
  });

  test('changes the member after a recorded claim and is asked for the next read', async ({
    page,
  }) => {
    await page.goto(DRYER);
    await expect(page.getByTestId('tag-done')).toBeVisible();

    await page.getByRole('button', { name: 'Not you?' }).click();
    await page.getByRole('button', { name: 'Celina' }).click();

    await expect(page.getByTestId('tag-again')).toContainText('From now on as Celina');
  });

  test('reads in Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto(DRYER);

    await expect(page.getByTestId('tag-done')).toContainText('opróżnione');
    await expect(page.getByTestId('tag-done')).toContainText('Zapisano dla Borys');
  });
});

test.describe('a browser that knows nobody', () => {
  test.use({ profile: 'none' });

  test('asks who holds the phone, remembers the choice and records the claim', async ({ page }) => {
    await page.goto(DRYER);

    await expect(page.getByRole('heading', { name: 'Who is holding the phone?' })).toBeVisible();
    await page.getByRole('button', { name: 'Celina' }).click();

    await expect(page.getByTestId('tag-done')).toContainText('Recorded for Celina');
    expect(await page.evaluate(() => localStorage.getItem('smart-home.profile'))).toContain(
      'Celina',
    );
  });

  test('sends nothing for a link that is no read of a tag', async ({ page }) => {
    await page.goto('/t');

    await expect(page.getByTestId('tag-invalid')).toContainText('This is not a read of a tag');
  });
});
