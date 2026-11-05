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

  // the scale runs from 20 to 80 °C - the water of a year (HAS-322): ten degrees are a sixth of it
  it('places the band between its two temperatures', async () => {
    await show(40);

    expect(part('band').style.left).toBe('30%');
    expect(part('band').style.width).toBe('6.67%');
  });

  it.each([
    [20, '0%'],
    [38, '30%'],
    [50, '50%'],
    [40.56, '34.27%'],
    [80, '100%'],
  ])('places the marker for %d °C at %s', async (value, left) => {
    await show(value);

    expect(part('marker').style.left).toBe(left);
  });

  // the number next to the gauge says how far off the scale the water is; the marker stays on it
  it.each([
    [5, '0%'],
    [-3, '0%'],
    [95, '100%'],
  ])('stops the marker at the end of the scale for %i °C', async (value, left) => {
    await show(value);

    expect(part('marker').style.left).toBe(left);
  });

  // a meter may only report a value on its scale; the reading in words keeps the true number
  it.each([
    [15, '20'],
    [85, '80'],
    [41.5, '41.5'],
  ])('reports %d °C to a screen reader as %s on its scale', async (value, reported) => {
    await show(value);

    const meter = (fixture.nativeElement as HTMLElement).querySelector('[role="meter"]')!;

    expect(meter.getAttribute('aria-valuenow')).toBe(reported);
    expect(meter.getAttribute('aria-valuetext')).toBe(`${value} degrees`);
  });

  it.each([
    ['no length', { min: 40, max: 40 }],
    ['its ends the wrong way round', { min: 50, max: 30 }],
  ])('keeps the band and the marker on the track for a scale with %s', async (_, scale) => {
    await show(40, scale);

    expect(part('marker').style.left).toBe('0%');
    expect(part('band').style.left).toBe('0%');
    expect(part('band').style.width).toBe('0%');
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
    expect(meter.getAttribute('aria-valuemin')).toBe('20');
    expect(meter.getAttribute('aria-valuemax')).toBe('80');
    expect(meter.getAttribute('aria-valuenow')).toBe('40.5');
    expect(meter.getAttribute('aria-valuetext')).toBe('40.5 degrees');
    // the numbers under the track are in the reading already
    expect(meter.querySelector('.gauge__scale')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('moves the marker when the temperature changes', async () => {
    await show(38);

    fixture.componentRef.setInput('value', 42);
    await fixture.whenStable();

    expect(part('marker').style.left).toBe('36.67%');
  });

  // on a scale of 60 degrees the two ends of a band of 4 would stand on each other: the band is named once, under
  // its middle, and the ends of the scale at its ends
  it('names the ends of the scale and the band under its middle', async () => {
    await show(40);

    const scale = (fixture.nativeElement as HTMLElement).querySelector('.gauge__scale')!;
    const labels = [...scale.querySelectorAll('span')].map((span) => span.textContent?.trim());
    expect(labels).toEqual(['20 °C', '38–42 °C', '80 °C']);
    expect((scale.querySelector('.gauge__band-label') as HTMLElement).style.left).toBe('33.335%');
  });
});
