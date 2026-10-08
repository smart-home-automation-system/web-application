import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting } from '../../../testing/i18n';
import { TemperatureGauge } from './temperature-gauge';

describe('TemperatureGauge', () => {
  let fixture: ComponentFixture<TemperatureGauge>;

  async function show(value: number, scale: { min?: number; max?: number } = {}): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    fixture = TestBed.createComponent(TemperatureGauge);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('low', 38);
    fixture.componentRef.setInput('high', 42);
    fixture.componentRef.setInput('label', 'Water');
    fixture.componentRef.setInput('valueText', `${value} degrees`);
    if (scale.min !== undefined) {
      fixture.componentRef.setInput('min', scale.min);
    }
    if (scale.max !== undefined) {
      fixture.componentRef.setInput('max', scale.max);
    }
    await fixture.whenStable();
  }

  function part(name: 'band' | 'marker'): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`.gauge__${name}`)!;
  }

  // the scale runs from 30 to 50 °C: one degree is 5 % of it
  it('places the band between its two temperatures', async () => {
    await show(40);

    expect(part('band').style.left).toBe('40%');
    expect(part('band').style.width).toBe('20%');
  });

  it.each([
    [30, '0%'],
    [38, '40%'],
    [40, '50%'],
    [40.56, '52.8%'],
    [50, '100%'],
  ])('places the marker for %d °C at %s', async (value, left) => {
    await show(value);

    expect(part('marker').style.left).toBe(left);
  });

  // the number next to the gauge says how far off the scale the water is; the marker stays on it
  it.each([
    [5, '0%'],
    [-3, '0%'],
    [75, '100%'],
  ])('stops the marker at the end of the scale for %i °C', async (value, left) => {
    await show(value);

    expect(part('marker').style.left).toBe(left);
  });

  it('follows another scale', async () => {
    await show(40, { min: 20, max: 60 });

    expect(part('marker').style.left).toBe('50%');
    expect(part('band').style.left).toBe('45%');
    expect(part('band').style.width).toBe('10%');
  });

  it('is a meter to a screen reader, with the name and the reading it was given', async () => {
    await show(40.5);

    const meter = (fixture.nativeElement as HTMLElement).querySelector('[role="meter"]')!;

    expect(meter.getAttribute('aria-label')).toBe('Water');
    expect(meter.getAttribute('aria-valuemin')).toBe('30');
    expect(meter.getAttribute('aria-valuemax')).toBe('50');
    expect(meter.getAttribute('aria-valuenow')).toBe('40.5');
    expect(meter.getAttribute('aria-valuetext')).toBe('40.5 degrees');
    // the numbers under the track are in the reading already
    expect(meter.querySelector('.gauge__scale')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('moves the marker when the temperature changes', async () => {
    await show(38);

    fixture.componentRef.setInput('value', 42);
    await fixture.whenStable();

    expect(part('marker').style.left).toBe('60%');
  });
});
