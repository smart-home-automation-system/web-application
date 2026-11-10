import { TestBed } from '@angular/core/testing';

import { FakeResource, answer, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { SoftenerAlert, SoftenerApi } from '../../data-access/water/softener-api';
import { SOFTENER_ALERTS_SHOWN, SoftenerAlerts } from './softener-alerts';

const words = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('SoftenerAlerts', () => {
  let alerts: FakeResource<SoftenerAlert[]>;

  beforeEach(() => {
    alerts = fakeResource();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: SoftenerApi, useValue: { watchAlerts: () => alerts } }],
    });
  });

  async function card(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SoftenerAlerts);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const alert = (n: number, extra: Partial<SoftenerAlert> = {}): SoftenerAlert => ({
    title: `Alert ${n}`,
    level: 'info',
    read: false,
    ...extra,
  });
  const titles = (element: HTMLElement) =>
    [...element.querySelectorAll('.softener-alerts__item strong')].map((title) => words(title));

  // a card of the first row of the page: the newest few, and what is left out counted - never dropped unseen
  it('lists the newest unread alerts and counts the unread ones it leaves out', async () => {
    answer(alerts, [
      alert(1),
      alert(2, { read: true }),
      ...[3, 4, 5, 6, 7].map((n) => alert(n)),
      alert(8, { read: true }),
    ]);
    const element = await card();

    expect(element.querySelectorAll('.softener-alerts__item')).toHaveLength(SOFTENER_ALERTS_SHOWN);
    expect(titles(element)).toEqual(['Alert 1', 'Alert 3', 'Alert 4', 'Alert 5']);
    expect(words(element.querySelector('[data-testid="softener-alerts-more"]'))).toBe(
      'And 2 more unread in the iQua application.',
    );
  });

  // read in the iQua application: off the card, and not counted either (HAS-412, owner 2026-11-10)
  it('leaves out what was read in the iQua application, without counting it', async () => {
    answer(alerts, [alert(1), alert(2, { read: true }), alert(3, { read: true }), alert(4, { read: true }), alert(5)]);
    const element = await card();

    expect(titles(element)).toEqual(['Alert 1', 'Alert 5']);
    expect(element.querySelector('[data-testid="softener-alerts-more"]')).toBeNull();
  });

  // missing is never taken for read
  it('lists an alert the cloud sent without saying whether it was read', async () => {
    answer(alerts, [{ title: 'Alert 1', level: 'info' }]);
    const element = await card();

    expect(titles(element)).toEqual(['Alert 1']);
  });

  it('says that nothing is new, with the date of the newest alert, when every one was read', async () => {
    answer(alerts, [
      alert(1, { read: true, at: '2026-10-18T09:12:00' }),
      alert(2, { read: true, at: '2026-05-05T10:00:00' }),
    ]);
    const element = await card();

    expect(element.querySelectorAll('.softener-alerts__item')).toHaveLength(0);
    expect(words(element.querySelector('[data-testid="softener-alerts-none"]'))).toBe(
      'No new alerts. The last one 18 Oct 2026.',
    );
  });

  it('says that nothing is new without a date when the cloud gave none', async () => {
    answer(alerts, [alert(1, { read: true })]);
    const element = await card();

    expect(words(element.querySelector('[data-testid="softener-alerts-none"]'))).toBe('No new alerts.');
  });

  it('says that the cloud keeps no alert at all', async () => {
    answer(alerts, []);
    const element = await card();

    expect(words(element.querySelector('[data-testid="softener-alerts-none"]'))).toBe(
      'The cloud keeps no alerts of the softener.',
    );
  });

  it('colours the salt apart from a fault, and counts in Polish', async () => {
    await useLanguage('pl');
    answer(alerts, [
      alert(1, { type: 'low_salt', level: 'warning' }),
      alert(2, { level: 'critical' }),
      ...[3, 4, 5].map((n) => alert(n)),
    ]);
    const element = await card();

    expect(element.querySelector('[data-level="salt"]')).toBeTruthy();
    expect(element.querySelector('[data-level="critical"]')).toBeTruthy();
    expect(words(element.querySelector('[data-testid="softener-alerts-more"]'))).toBe(
      'Kolejne nieprzeczytane w aplikacji iQua: 1.',
    );
  });

  it('says in Polish that nothing is new', async () => {
    await useLanguage('pl');
    answer(alerts, [alert(1, { read: true, at: '2026-10-18T09:12:00' })]);
    const element = await card();

    expect(words(element.querySelector('[data-testid="softener-alerts-none"]'))).toBe(
      'Brak nowych alertów. Ostatni 18 paź 2026.',
    );
  });
});
