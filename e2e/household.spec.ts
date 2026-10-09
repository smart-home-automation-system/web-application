import { Locator, Page } from '@playwright/test';

import { expect, startIn, test, useScenario } from './support';

/**
 * The administration of the household, fed by the mock API - whose registry can be changed, in
 * the memory of the page, and refuses what the real one refuses. Nothing here reaches a real
 * registry. The mock household: Aurelia (the administrator these tests start as), Borys,
 * Celina and Damian, and Emil, who is switched off.
 */
const member = (page: Page, name: string): Locator => page.locator(`[data-member="${name}"]`);

async function open(page: Page): Promise<void> {
  await page.goto('/household');
  await expect(page.getByTestId('member')).toHaveCount(5);
}

test('lists everybody the registry holds, switched off or not', async ({ page }) => {
  await open(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Household' })).toBeVisible();
  const celina = member(page, 'Celina');
  await expect(celina).toContainText('Resident');
  await expect(celina.getByTestId('phone')).toHaveText('+48500100103');
  await expect(celina.getByTestId('rooms')).toHaveText('bedroom wardrobe');
  await expect(celina.getByTestId('permissions')).toHaveText(
    'May switch the heating of the whole house',
  );
  await expect(celina.getByTestId('device')).toContainText('Phone 02:00:00:00:c3:01');

  await expect(member(page, 'Damian').getByTestId('rooms')).toHaveText('None');
  await expect(member(page, 'Emil').getByTestId('switched-off')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test.describe('adding a member', () => {
  test('says what is wrong before anything is sent', async ({ page }) => {
    await open(page);
    const form = page.getByTestId('registry');
    await form.getByRole('button', { name: 'Add a member' }).click();

    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(form).toContainText('A name has 3 to 50 characters.');
    await expect(form).toContainText('A phone number starts with +');

    // a name belongs to one member, whatever its case - and so does a phone number
    await form.getByLabel('Name').fill('aurelia');
    await form.getByLabel('Phone').fill('+48 500 100 102');
    await expect(form).toContainText('Another member already has this name.');
    await expect(form).toContainText('Another member already has this phone number.');

    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('member')).toHaveCount(5);
  });

  test('adds the member as entered, the phone number without its spaces', async ({ page }) => {
    await open(page);
    const form = page.getByTestId('registry');
    await form.getByRole('button', { name: 'Add a member' }).click();

    await form.getByLabel('Name').fill('  Fabian ');
    await form.getByLabel('Phone').fill('+48 500 100-106');
    await form.getByRole('button', { name: 'Add: garage' }).click();
    await form.getByRole('button', { name: 'Add: loft' }).click();
    await form.getByRole('button', { name: 'Move up: loft' }).click();
    await form.getByRole('button', { name: 'Add', exact: true }).click();

    const fabian = member(page, 'Fabian');
    await expect(fabian.getByTestId('phone')).toHaveText('+48500100106');
    await expect(fabian.getByTestId('rooms')).toHaveText('loft garage');
    await expect(fabian).toContainText('Resident');
    // the form is gone, and the button is back
    await expect(form.getByRole('button', { name: 'Add a member' })).toBeVisible();
  });
});

test.describe('changing a member', () => {
  test('changes the role, the rooms and the permissions', async ({ page }) => {
    await open(page);
    const borys = member(page, 'Borys');
    await borys.getByRole('button', { name: 'Edit', exact: true }).click();

    await borys.getByRole('radio', { name: 'Administrator' }).click();
    await borys.getByRole('button', { name: 'Add: office' }).click();
    await borys.getByRole('button', { name: 'Take away: loft' }).click();
    await borys.getByRole('switch', { name: 'May switch the heating of the whole house' }).click();
    await borys.getByRole('button', { name: 'Save' }).click();

    await expect(borys.getByTestId('rooms')).toHaveText('office');
    await expect(borys).toContainText('Administrator');
    await expect(borys.getByTestId('permissions')).toHaveText(
      'May switch the heating of the whole house',
    );
  });

  // the personal link is built from the name and the presence history is kept under it
  test('says what a new name brings with it, and renames', async ({ page }) => {
    await open(page);
    const borys = member(page, 'Borys');
    await borys.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(borys.getByTestId('rename-warning')).toHaveCount(0);

    // only the spelling: the link finds a member whatever the case, the presence history does not
    await borys.getByLabel('Name').fill('BORYS');
    await expect(borys.getByTestId('rename-warning')).toContainText('keeps working');

    await borys.getByLabel('Name').fill('Bogdan');
    await expect(borys.getByTestId('rename-warning')).toContainText('the old link');
    await borys.getByRole('button', { name: 'Save' }).click();

    await expect(member(page, 'Bogdan').getByTestId('phone')).toHaveText('+48500100102');
    await expect(member(page, 'Borys')).toHaveCount(0);
  });

  test('switches a member off and on again', async ({ page }) => {
    await open(page);
    const borys = member(page, 'Borys');

    await borys.getByRole('button', { name: 'Switch off' }).click();
    await expect(borys.getByTestId('switched-off')).toBeVisible();
    // switched off, a member has no profile - and so no link to hand out
    await expect(borys.getByTestId('personal-link')).toHaveCount(0);

    await borys.getByRole('button', { name: 'Switch on' }).click();
    await expect(borys.getByTestId('switched-off')).toHaveCount(0);
    await expect(borys.getByTestId('personal-link')).toBeVisible();
  });

  test('removes a member only after a question', async ({ page }) => {
    await open(page);
    const damian = member(page, 'Damian');

    await damian.getByRole('button', { name: 'Remove', exact: true }).click();
    const cancel = damian.getByRole('group').getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(damian.getByRole('group')).toHaveCount(0);
    await expect(page.getByTestId('member')).toHaveCount(5);

    await damian.getByRole('button', { name: 'Remove', exact: true }).click();
    await damian.getByRole('group').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(damian).toHaveCount(0);
    await expect(page.getByTestId('member')).toHaveCount(4);
  });

  // each of these would take the profile this browser remembers, or close this page to its user
  test('does not let the administrator switch off, remove, rename or demote themselves', async ({
    page,
  }) => {
    await open(page);
    const own = member(page, 'Aurelia');

    await expect(own).toContainText('You');
    await expect(own.getByRole('button', { name: 'Switch off' })).toHaveCount(0);
    await expect(own.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);

    await own.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(own.getByLabel('Name')).toBeDisabled();
    await expect(own.getByRole('radio', { name: 'Resident' })).toBeDisabled();
    await expect(own.getByLabel('Phone')).toBeEnabled();
  });

  test('tells a change the registry did not carry out, and keeps what the registry has', async ({
    page,
  }) => {
    await useScenario(page, 'writes-fail');
    await open(page);
    const borys = member(page, 'Borys');

    await borys.getByRole('button', { name: 'Switch off' }).click();

    await expect(borys.getByTestId('change-failure')).toContainText(
      'The change was not carried out.',
    );
    await expect(borys.getByTestId('switched-off')).toHaveCount(0);
    await expect(borys.locator('mat-progress-bar')).toHaveCount(0);
  });
});

test.describe('the devices of a member', () => {
  test('adds a device, its address rewritten the way the registry keeps it', async ({ page }) => {
    await open(page);
    const damian = member(page, 'Damian');
    await damian.getByRole('button', { name: 'Add a device' }).click();

    await damian.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(damian).toContainText('Give the device a name');
    await expect(damian).toContainText('A MAC address is six pairs');

    // an address is registered once in the whole registry: this one is Aurelia's
    await damian.getByLabel('MAC address').fill('02:00:00:00:A1:01');
    await expect(damian).toContainText('A device with this MAC address is already registered.');

    await damian.getByLabel('Name of the device').fill('Phone');
    await damian.getByLabel('MAC address').fill('0A-1B-2C-3D-4E-5F');
    await damian.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(damian.getByTestId('device')).toContainText('Phone 0a:1b:2c:3d:4e:5f');
  });

  test('changes a device and removes one after a question', async ({ page }) => {
    await open(page);
    const aurelia = member(page, 'Aurelia');

    await aurelia.getByRole('button', { name: 'Edit the device Watch' }).click();
    await aurelia.getByLabel('Name of the device').fill('Tablet');
    await aurelia.getByRole('button', { name: 'Save' }).click();
    await expect(aurelia.getByTestId('device').filter({ hasText: 'Tablet' })).toHaveCount(1);

    await aurelia.getByRole('button', { name: 'Remove the device Tablet' }).click();
    await expect(aurelia.getByRole('group')).toContainText('Remove this device? Tablet');
    await aurelia.getByRole('group').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(aurelia.getByTestId('device')).toHaveCount(1);
  });
});

test.describe('the personal link', () => {
  test('is shown with its QR code', async ({ page, baseURL }) => {
    await open(page);
    const celina = member(page, 'Celina');

    await expect(celina.getByTestId('personal-link')).toHaveText(`${baseURL}/u/Celina`);
    await expect(celina.getByRole('img')).toHaveCount(0);
    await celina.getByRole('button', { name: 'Show the QR code' }).click();
    await expect(celina.getByRole('img', { name: 'QR code of the personal link' })).toBeVisible();
  });

  // what the code holds is the link (a unit test reads the code back); this is where it leads
  test('opens the profile of its member', async ({ page }) => {
    await open(page);
    const link = await member(page, 'Celina').getByTestId('personal-link').getAttribute('href');

    await page.goto(link!);

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.locator('.shell__profile')).toContainText('Celina');
  });
});

test.describe('somebody else', () => {
  test.use({ profile: 'resident' });

  test('is not offered the page: a resident is led to their room', async ({ page }) => {
    await page.goto('/household');

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('link', { name: 'Household' })).toHaveCount(0);
  });
});

test('reads in Polish', async ({ page }) => {
  await startIn(page, 'pl');
  await open(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Domownicy' })).toBeVisible();
  await expect(member(page, 'Emil').getByTestId('switched-off')).toHaveText('Wyłączony');
  await member(page, 'Damian').getByRole('button', { name: 'Usuń' }).click();
  await expect(member(page, 'Damian').getByRole('group')).toContainText('Usunąć tego domownika');
});
