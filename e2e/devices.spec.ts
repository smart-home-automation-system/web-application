import { Locator, Page } from '@playwright/test';

import { expect, startIn, test, useScenario } from './support';

/**
 * The administration of the device registry, fed by the mock API - whose registry can be
 * changed, in the memory of the page, and refuses what the real one refuses. Nothing here
 * reaches a real registry. The mock house has fourteen invented devices: Shelly ones of every
 * generation, Eaton ones on both gateways, three Bluetooth sensors, blinds that are switched
 * off and blinds with the sensor of their window.
 *
 * The page has a card per room, floor by floor; the devices of a room are in its window
 * (HAS-290, owner 2026-10-17).
 */
const card = (page: Page, name: string): Locator => page.locator(`[data-room-card="${name}"]`);
const dialog = (page: Page): Locator => page.getByRole('dialog');
const count = (page: Page): Locator => page.getByTestId('registry').getByTestId('count');
const device = (page: Page, name: string): Locator =>
  dialog(page)
    .getByTestId('device')
    .filter({ has: page.getByTestId('name').getByText(name, { exact: true }) });

/** Chooses from a select of a form: its list opens over the page, outside the form. */
async function choose(form: Locator, label: string, option: string): Promise<void> {
  await form.getByRole('combobox', { name: label }).click();
  await form.page().getByRole('option', { name: option, exact: true }).click();
}

async function open(page: Page): Promise<void> {
  await page.goto('/devices');
  await expect(count(page)).toHaveText('Devices: 14');
}

/** The window of a room, opened with one of the two buttons of its card. */
async function openRoom(
  page: Page,
  room: string,
  how: 'Details' | 'Add' = 'Details',
): Promise<Locator> {
  await card(page, room).getByRole('button', { name: how }).click();
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

test('lays the rooms out floor by floor, each counting its devices by kind', async ({ page }) => {
  await open(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Devices' })).toBeVisible();
  await expect(page.getByTestId('floor').locator('h2')).toHaveText([
    'Ground floor',
    'Upper floor',
    'Circulation',
    'Attic',
    'Outside',
  ]);
  // every room of the house, an empty one too - in the order of the house
  await expect(
    page.locator('[data-floor="upper"] [data-room-card]').locator('mat-card-title'),
  ).toHaveText(['office', 'tobi', 'livia', 'bedroom', 'wardrobe', 'bathroom up']);
  const office = card(page, 'office');
  await expect(office.getByTestId('count')).toHaveText('Devices: 5');
  await expect(office.locator('[data-kind="blinds"]')).toHaveText(/Blinds\s*2/);
  await expect(office.locator('[data-kind="presence sensor"]')).toHaveText(
    /Presence sensor\s*none/,
  );
  // HAS-289: the corridor upstairs, written with a space as every room of two words
  await expect(page.locator('[data-floor="circulation"] [data-room-card="hall up"]')).toBeVisible();
  // the weather station and the Bluetooth gateways count as other
  await expect(card(page, 'garden').locator('[data-kind="other"]')).toHaveText(/Other\s*2/);

  // the cards are all of one size
  const sizes = await page.locator('[data-room-card]').evaluateAll((cards) =>
    cards.map((one) => {
      const box = one.getBoundingClientRect();
      return `${Math.round(box.width)}x${Math.round(box.height)}`;
    }),
  );
  expect(new Set(sizes).size).toBe(1);
  // and no device is listed on the page itself
  await expect(page.getByTestId('device')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('shows the devices of a room in its window, with how each is reached', async ({ page }) => {
  await open(page);
  const office = await openRoom(page, 'office');

  await expect(office.getByTestId('floor')).toHaveText('Upper floor');
  await expect(office.getByTestId('name')).toHaveText([
    'Office door blinds',
    'Office window blinds',
    'Office main light',
    'Office window sensor',
    'Office temperature sensor 48',
  ]);
  const door = device(page, 'Office door blinds');
  await expect(door.getByTestId('kind')).toContainText('outside the window');
  await expect(door.getByTestId('kind')).toContainText('can be sent to a position');
  await expect(door.getByTestId('generation')).toHaveText('Gen 2');
  await expect(door.getByTestId('binding')).toContainText('shellyplus2pm-0a0b0c0d0e01');
  const sensor = device(page, 'Office temperature sensor 48');
  await expect(sensor.getByTestId('binding')).toContainText('gateway blinds point 48');

  // the window has one size for every room
  const big = await office.boundingBox();
  await office.getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
  const loft = await openRoom(page, 'tobi');
  await expect(loft.getByTestId('no-devices')).toHaveText('No device in this room yet.');
  const empty = await loft.boundingBox();
  expect([empty?.width, empty?.height]).toEqual([big?.width, big?.height]);
});

test.describe('adding a device', () => {
  test('opens the form from the card, and says what is wrong before anything is sent', async ({
    page,
  }) => {
    await open(page);
    const room = await openRoom(page, 'loft', 'Add');
    const form = room.locator('app-smart-device-form');
    // the room of the card is the one offered
    await expect(form.getByRole('combobox', { name: 'Room' })).toHaveText('loft');

    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(form).toContainText('A name has 3 to 50 characters.');
    await expect(form).toContainText('Choose what the device is.');

    await form.getByLabel('Name').fill('Loft blinds');
    // the list is a sheet of the application - the corners of the menu, not Material's square top
    await form.getByRole('combobox', { name: 'Kind' }).click();
    await expect(page.locator('.mat-mdc-select-panel')).toHaveCSS('border-radius', '12px');
    await page.getByRole('option', { name: 'Blinds', exact: true }).click();
    // blinds are wired: a Shelly or the AMX system, never Bluetooth
    await expect(form.getByTestId('binding').getByRole('radio')).toHaveText([
      'Shelly on the network',
      'Eaton, through the AMX system',
    ]);
    await form.getByLabel('Address').fill('192.0.2.300');
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(form).toContainText('An address is four numbers from 0 to 255');
    await expect(form).toContainText('A Shelly of generation 2 or later needs the id');

    // a Gen1 device has no id to give
    await form.getByTestId('generation').getByRole('radio', { name: '1' }).click();
    await expect(form).not.toContainText('A Shelly of generation 2 or later needs the id');

    // the address another device already has, on the same channel - here: none
    await form.getByLabel('Address').fill('192.0.2.21');
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(form.getByTestId('binding-taken')).toHaveText(
      'Another device already has this channel of the Shelly at this address.',
    );
    await expect(count(page)).toHaveText('Devices: 14');
  });

  test('registers a Shelly as entered, in its room', async ({ page }) => {
    await open(page);
    const room = await openRoom(page, 'loft', 'Add');
    const form = room.locator('app-smart-device-form');

    await form.getByLabel('Name').fill('  Loft blinds ');
    await choose(form, 'Kind', 'Blinds');
    await form.getByLabel('Address').fill('192.0.2.60');
    await form.getByLabel('Device id').fill('shellyplus2pm-0a0b0c0d0e99');
    await form.getByTestId('channel').getByRole('radio', { name: '0' }).click();
    await form.getByTestId('placement').getByRole('radio', { name: 'outside the window' }).click();
    await form.getByTestId('positioning').getByRole('radio', { name: 'Yes' }).click();
    await form.getByRole('button', { name: 'Add', exact: true }).click();

    const added = device(page, 'Loft blinds');
    await expect(added.getByTestId('generation')).toHaveText('Gen 2');
    await expect(added.getByTestId('binding')).toContainText('192.0.2.60');
    await expect(added.getByTestId('binding')).toContainText('channel 0');
    await expect(added.getByTestId('kind')).toContainText('outside the window');
    // the form is gone, the window shows the room, and its card counts the device
    await expect(room.locator('app-smart-device-form')).toHaveCount(0);
    await expect(count(page)).toHaveText('Devices: 15');
    await expect(card(page, 'loft').locator('[data-kind="blinds"]')).toHaveText(/Blinds\s*1/);
  });

  test('registers an Eaton device and a Bluetooth sensor from the window of their room', async ({
    page,
  }) => {
    await open(page);
    const office = await openRoom(page, 'office');
    await office.getByRole('button', { name: 'Add a device here' }).click();
    await expect(office.getByRole('combobox', { name: 'Room' })).toHaveText('office');
    await office.getByLabel('Name').fill('Office desk lamp');
    await choose(office, 'Kind', 'Light');
    await office.getByTestId('binding').getByRole('radio', { name: 'Eaton' }).click();
    await office.getByTestId('gateway').getByRole('radio', { name: 'lights' }).click();
    // the point another device has on that gateway
    await office.getByLabel('Point').fill('12');
    await office.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(office.getByTestId('binding-taken')).toHaveText(
      'Another device already has this point of the gateway.',
    );
    await office.getByLabel('Point').fill('13');
    await office.getByTestId('light-kind').getByRole('radio', { name: 'dimmed' }).click();
    await office.getByRole('button', { name: 'Add', exact: true }).click();

    const lamp = device(page, 'Office desk lamp');
    await expect(lamp.getByTestId('vendor')).toHaveText('Eaton');
    await expect(lamp.getByTestId('binding')).toContainText('gateway lights point 13');
    await expect(lamp.getByTestId('kind')).toContainText('dimmed');
    await office.getByRole('button', { name: 'Close' }).click();

    const kitchen = await openRoom(page, 'kitchen', 'Add');
    await kitchen.getByLabel('Name').fill('Kitchen door sensor');
    await choose(kitchen, 'Kind', 'Opening sensor');
    await kitchen.getByTestId('binding').getByRole('radio', { name: 'Bluetooth' }).click();
    // capitals and dashes are the same address
    await kitchen.getByLabel('Bluetooth address').fill('7C-C6-B6-00-00-09');
    await kitchen.getByTestId('vendor').getByRole('radio', { name: 'Other' }).click();
    await kitchen.getByRole('button', { name: 'Add', exact: true }).click();

    const sensor = device(page, 'Kitchen door sensor');
    await expect(sensor.getByTestId('binding')).toContainText('Bluetooth 7c:c6:b6:00:00:09');
    await expect(sensor.getByTestId('vendor')).toHaveText('Other');
    await expect(count(page)).toHaveText('Devices: 16');
  });
});

test.describe('changing a device', () => {
  test('moves a device to another room, and keeps its kind', async ({ page }) => {
    await open(page);
    await openRoom(page, 'office');
    const light = device(page, 'Office main light');
    await light.getByRole('button', { name: 'Edit Office main light' }).click();

    const form = dialog(page).locator('app-smart-device-form');
    // the registry refuses another kind for a device it has
    await expect(form.getByRole('combobox', { name: 'Kind' })).toBeDisabled();
    await expect(form).toContainText('The kind of a registered device cannot be changed.');
    await expect(form.getByLabel('Address')).toHaveValue('192.0.2.23');
    await form.getByLabel('Name').fill('Bedroom main light');
    await choose(form, 'Room', 'bedroom');
    await form.getByRole('button', { name: 'Save' }).click();

    // the window follows the registry: the device left the office
    await expect(dialog(page).getByTestId('device')).toHaveCount(4);
    await expect(card(page, 'office').getByTestId('count')).toHaveText('Devices: 4');
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await openRoom(page, 'bedroom');
    await expect(dialog(page).getByTestId('name')).toHaveText([
      'Bedroom light strip',
      'Bedroom main light',
    ]);
    // everything else of the device is as it was
    const moved = device(page, 'Bedroom main light');
    await expect(moved.getByTestId('binding')).toContainText('shelly1pmg3-0a0b0c0d0e02');
    await expect(moved.getByTestId('kind')).toContainText('switched');
  });

  test('switches a device off for the services, and on again', async ({ page }) => {
    await open(page);
    await openRoom(page, 'office');
    const light = device(page, 'Office main light');

    await light
      .getByRole('button', { name: 'Take out of use by the services Office main light' })
      .click();
    await expect(light.getByTestId('not-used')).toBeVisible();

    await light.getByRole('button', { name: 'Let the services use Office main light' }).click();
    await expect(light.getByTestId('not-used')).toHaveCount(0);
  });

  test('shows a change the registry did not carry out next to the device as it is', async ({
    page,
  }) => {
    await useScenario(page, 'writes-fail');
    await open(page);
    await openRoom(page, 'office');
    const light = device(page, 'Office main light');

    await light
      .getByRole('button', { name: 'Take out of use by the services Office main light' })
      .click();

    const failure = dialog(page).getByTestId('change-failure');
    await expect(failure).toContainText('The change was not carried out.');
    await expect(light.getByTestId('not-used')).toHaveCount(0);
  });
});

// HAS-290: the sensors of the window of one blinds, never of the room
test.describe('the window sensors of blinds', () => {
  test('shows the sensor of a window, and links another one', async ({ page }) => {
    await open(page);
    await openRoom(page, 'office');
    const blinds = device(page, 'Office window blinds');
    await expect(blinds.getByTestId('opening-sensors')).toHaveText(
      'Window sensors: Office window sensor',
    );

    await blinds.getByRole('button', { name: 'Edit Office window blinds' }).click();
    const form = dialog(page).locator('app-smart-device-form');
    const sensors = form.getByRole('combobox', { name: 'Window sensors' });
    await expect(sensors).toContainText('Office window sensor');
    await sensors.click();
    await page.getByRole('option', { name: /Kitchen window sensor/ }).click();
    await page.keyboard.press('Escape');
    await form.getByRole('button', { name: 'Save' }).click();

    await expect(blinds.getByTestId('opening-sensors')).toHaveText(
      'Window sensors: Office window sensor, Kitchen window sensor',
    );
  });

  test('keeps a sensor the blinds still name', async ({ page }) => {
    await open(page);
    await openRoom(page, 'office');
    const sensor = device(page, 'Office window sensor');

    await sensor.getByRole('button', { name: 'Remove Office window sensor' }).click();
    const question = sensor.getByRole('group');
    await expect(question.getByTestId('sensor-in-use')).toContainText('Office window blinds');
    await expect(question.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });
});

test.describe('removing a device', () => {
  test('asks first, and says what the house loses with an Eaton device', async ({ page }) => {
    await open(page);
    await openRoom(page, 'office');
    const sensor = device(page, 'Office temperature sensor 48');

    await sensor.getByRole('button', { name: 'Remove Office temperature sensor 48' }).click();
    const question = sensor.getByRole('group');
    await expect(question).toContainText('Remove this device from the registry?');
    await expect(question.getByTestId('eaton-warning')).toContainText(
      'The AMX system asks for this point with every datagram.',
    );
    // the safe answer has the focus
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await question.getByRole('button', { name: 'Cancel' }).click();
    await expect(sensor.getByRole('group')).toHaveCount(0);
    await expect(count(page)).toHaveText('Devices: 14');
  });

  test('removes the device, and its room stays with none', async ({ page }) => {
    await open(page);
    const hall = await openRoom(page, 'hall up');
    const sensor = device(page, 'Hall motion sensor');

    await sensor.getByRole('button', { name: 'Remove Hall motion sensor' }).click();
    // a Shelly is nobody's point: no warning about the AMX system
    await expect(sensor.getByTestId('eaton-warning')).toHaveCount(0);
    await sensor.getByRole('group').getByRole('button', { name: 'Remove' }).click();

    await expect(count(page)).toHaveText('Devices: 13');
    await expect(hall.getByTestId('no-devices')).toBeVisible();
    await expect(card(page, 'hall up').getByTestId('count')).toHaveText('Devices: 0');
  });
});

test.describe('somebody else', () => {
  test.use({ profile: 'resident' });

  test('is not offered the page: a resident is led to their room', async ({ page }) => {
    await page.goto('/devices');

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('link', { name: 'Devices' })).toHaveCount(0);
  });
});

test('reads in Polish', async ({ page }) => {
  await startIn(page, 'pl');
  await page.goto('/devices');

  await expect(page.getByRole('heading', { level: 1, name: 'Urządzenia' })).toBeVisible();
  const living = card(page, 'living room');
  await expect(living.locator('[data-kind="blinds"]')).toHaveText(/Rolety\s*1 szt\./);
  await expect(living.locator('[data-kind="presence sensor"]')).toContainText('brak');
  await living.getByRole('button', { name: 'Szczegóły' }).click();
  const blinds = device(page, 'Living room terrace blinds');
  await expect(blinds.getByTestId('not-used')).toHaveText('Nieużywane przez serwisy');
  await expect(blinds.getByTestId('kind')).toContainText('Rolety');
  await blinds.getByRole('button', { name: 'Usuń Living room terrace blinds' }).click();
  await expect(blinds.getByRole('group')).toContainText('Usunąć to urządzenie z rejestru?');
});
