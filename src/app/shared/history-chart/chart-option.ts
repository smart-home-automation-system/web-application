import type { EChartsCoreOption } from 'echarts/core';

import { dateTimeFormat, numberFormat } from '../../core/i18n/intl-formats';
import { ChartLine } from './chart-data';

/** A band of values drawn behind the lines - the temperatures the hot water is kept between. */
export interface ChartBand {
  readonly low: number;
  readonly high: number;
  /** Its name in the chart, in the language of the interface. */
  readonly name: string;
}

/** The colours of the theme as the browser resolved them: a drawing cannot hold a `var()`. */
export interface ChartColors {
  /** `--app-chart-1` ... `-5`, in order. */
  readonly lines: readonly string[];
  readonly text: string;
  readonly strongText: string;
  readonly grid: string;
  readonly surface: string;
  readonly fontFamily: string;
}

export interface ChartInput {
  readonly lines: readonly ChartLine[];
  /** The ends of the axis on the wall-clock timeline of the house. */
  readonly from: number;
  readonly to: number;
  readonly band?: ChartBand;
  /** The unit written after every value, `°C`. */
  readonly unit: string;
  readonly locale: string;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** In a tooltip a value has two decimals at most - what the services round to. */
const VALUE: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 2 };

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? '',
  );

/**
 * The times on the axis. They are wall-clock times of the house placed on the UTC timeline, so
 * they are formatted in UTC and no zone ever shifts them - the rule of `formatHouseDateTime`.
 * Up to two days the axis reads as a clock, with the date where a day begins; beyond, as dates.
 */
export function axisLabel(at: number, spanMs: number, locale: string): string {
  const day = dateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  if (spanMs > 2 * DAY_MS || at % DAY_MS === 0) {
    return day.format(at);
  }
  return dateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** The moment a tooltip is about: the day and the time, as the house had them. */
export function tooltipTime(at: number, locale: string): string {
  return dateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/**
 * What ECharts is asked to draw. A pure function of the data, the colours and the language, so
 * a test can read the drawing without a browser that draws.
 */
export function chartOption(input: ChartInput, colors: ChartColors): EChartsCoreOption {
  const span = input.to - input.from;
  const value = numberFormat(input.locale, VALUE);
  const axisValue = numberFormat(input.locale, { maximumFractionDigits: 1 });
  const text = { color: colors.text, fontFamily: colors.fontFamily };
  const band = input.band;

  return {
    // the wall clock of the house lies on the UTC timeline: nothing may read it in another zone
    useUTC: true,
    // a chart that is redrawn with every poll must not slide about
    animation: false,
    textStyle: text,
    color: input.lines.map((line) => colors.lines[line.color - 1]),
    grid: { left: 52, right: 16, top: 36, bottom: 28 },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 3,
      textStyle: { ...text, color: colors.strongText },
      // a legend entry is no switch here: a line that vanishes at a click reads as missing data
      selectedMode: false,
    },
    tooltip: {
      trigger: 'axis',
      // inside the chart: a tooltip appended to the page would lie outside the card on a phone
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.grid,
      textStyle: { ...text, color: colors.strongText },
      axisPointer: { type: 'line', lineStyle: { color: colors.text } },
      formatter: (hovered: unknown) => {
        const rows = (Array.isArray(hovered) ? hovered : [hovered]) as {
          readonly value?: readonly [number, number | null];
          readonly seriesName?: string;
          readonly marker?: string;
        }[];
        const at = rows[0]?.value?.[0];
        const lines = rows
          .filter((row) => typeof row.value?.[1] === 'number')
          // the marker is ECharts' own markup; the name is ours, and escaped all the same
          .map(
            (row) =>
              `${row.marker ?? ''}${escapeHtml(row.seriesName ?? '')}: <strong>${value.format(
                row.value?.[1] ?? 0,
              )} ${input.unit}</strong>`,
          );
        return [at === undefined ? '' : escapeHtml(tooltipTime(at, input.locale)), ...lines].join(
          '<br>',
        );
      },
    },
    xAxis: {
      type: 'time',
      min: input.from,
      max: input.to,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { lineStyle: { color: colors.grid } },
      axisLabel: {
        ...text,
        hideOverlap: true,
        formatter: (at: number) => axisLabel(at, span, input.locale),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      // around the values, not from zero: a room moves by a degree or two
      scale: true,
      // the band is part of the picture also while every reading lies on one side of it
      min: (extent: { min: number }) =>
        Math.floor(band === undefined ? extent.min : Math.min(extent.min, band.low)) - 1,
      max: (extent: { max: number }) =>
        Math.ceil(band === undefined ? extent.max : Math.max(extent.max, band.high)) + 1,
      axisLabel: { ...text, formatter: (at: number) => `${axisValue.format(at)} ${input.unit}` },
      splitLine: { lineStyle: { color: colors.grid, opacity: 0.35 } },
    },
    series: input.lines.map((line, index) => ({
      type: 'line',
      id: line.key,
      name: line.name,
      data: line.points,
      // a break in the line is a gap in the readings: never bridged
      connectNulls: false,
      // a point between two gaps has no line to either side, and would not be drawn at all
      showSymbol: !line.dashed,
      symbol: 'circle',
      symbolSize: 2.5,
      lineStyle: { width: 2, type: line.dashed ? 'dashed' : 'solid' },
      emphasis: { disabled: true },
      ...(index === 0 && band !== undefined
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: colors.text, opacity: 0.12 },
              // no words inside the picture: a line crosses the band anywhere, and would cross
              // them - the caller says next to the chart what the shaded band is
              label: { show: false },
              data: [[{ name: band.name, yAxis: band.low }, { yAxis: band.high }]],
            },
          }
        : {}),
    })),
  };
}
