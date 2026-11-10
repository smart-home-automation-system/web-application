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
    ...extra,
  });

  // a card of the first row of the page: the newest few, and what is left out counted - never dropped unseen
  it('lists the newest alerts and counts the older ones it leaves out', async () => {
    answer(alerts, [1, 2, 3, 4, 5, 6].map((n) => alert(n)));
    const element = await card();

    expect(element.querySelectorAll('.softener-alerts__item')).toHaveLength(SOFTENER_ALERTS_SHOWN);
    expect(words(element.querySelector('[data-testid="softener-alerts-more"]'))).toBe(
      'And 2 older in the iQua application.',
    );
  });

  it('says nothing more when every alert is listed', async () => {
    answer(alerts, [alert(1), alert(2)]);
    const element = await card();

    expect(element.querySelector('[data-testid="softener-alerts-more"]')).toBeNull();
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
      'Starszych w aplikacji iQua: 1.',
    );
  });
});
