import type { EChartsCoreOption } from 'echarts/core';

import { dateTimeFormat, numberFormat } from '../../core/i18n/intl-formats';
import { ChartLine, LinePoint } from './chart-data';

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
  /** The unit written after every value, `°C`; empty for a value without a known unit. */
  readonly unit: string;
  readonly locale: string;
  /**
   * A logarithmic value axis - for a light that spans 0 to 100 000 lx in a day, where a linear
   * axis shows the whole night as one flat line. Every value has to be above zero then.
   */
  readonly logarithmic?: boolean;
  /** Decimals of a value in the tooltip; one or two by default (what the services round to). */
  readonly decimals?: number;
  /**
   * What the value can never go past - a wind below 0 m/s, a humidity above 100 %. The axis keeps
   * a step of air around the values, but never steps over these.
   */
  readonly bounds?: { readonly min?: number; readonly max?: number };
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
 * What a line says at a moment that lies between two of its points: the value on the stretch
 * that covers the moment. `undefined` at a break, and outside the line.
 */
export function valueAt(points: readonly LinePoint[], at: number): number | undefined {
  for (let index = 0; index + 1 < points.length; index++) {
    const [from, start] = points[index];
    const [to, end] = points[index + 1];
    if (start === null || end === null || at < from || at > to) {
      continue;
    }
    return to === from ? end : start + ((end - start) * (at - from)) / (to - from);
  }
  return undefined;
}

/** The dot before a row of the tooltip, in the colour of its line - a colour the browser resolved. */
const markerOf = (color: string) =>
  `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${escapeHtml(color)};"></span>`;

/**
 * What ECharts is asked to draw. A pure function of the data, the colours and the language, so
 * a test can read the drawing without a browser that draws.
 */
export function chartOption(input: ChartInput, colors: ChartColors): EChartsCoreOption {
  const span = input.to - input.from;
  const value = numberFormat(
    input.locale,
    input.decimals === undefined
      ? VALUE
      : { minimumFractionDigits: input.decimals, maximumFractionDigits: input.decimals },
  );
  const bars = input.lines.some((line) => line.bars);
  /** A value with its unit; no space and no unit where the unit is not known. */
  const withUnit = (text: string, unitText: string) => (unitText ? `${text} ${unitText}` : text);
  const axisValue = numberFormat(input.locale, { maximumFractionDigits: 1 });
  const text = { color: colors.text, fontFamily: colors.fontFamily };
  const band = input.band;
  /** The lines that are steps, by name: their place in a tooltip is worked out, not taken. */
  const steps = new Set(input.lines.filter((line) => line.dashed).map((line) => line.name));
  // the tooltip is HTML: the unit is a text of a caller, and escaped like the names
  const unit = escapeHtml(input.unit);

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
        // The moment is that of a measured point. A line of steps has points at its edges only,
        // so ECharts lists it where the pointer is near an edge and nowhere else - or twice,
        // where two steps share one: what it asks for at the moment is read off the line here.
        const measured = rows.filter((row) => !steps.has(row.seriesName ?? ''));
        const at = (measured[0] ?? rows[0])?.value?.[0];
        const row = (marker: string, name: string, reading: number) =>
          // the markers are markup of ECharts and of this file; a name is ours, and escaped
          // all the same
          `${marker}${escapeHtml(name)}: <strong>${withUnit(value.format(reading), unit)}</strong>`;
        const lines = [
          ...measured.flatMap((hoveredRow) => {
            const reading = hoveredRow.value?.[1];
            return typeof reading === 'number'
              ? [row(hoveredRow.marker ?? '', hoveredRow.seriesName ?? '', reading)]
              : [];
          }),
          ...input.lines.flatMap((line) => {
            const asked = line.dashed && at !== undefined ? valueAt(line.points, at) : undefined;
            return asked === undefined
              ? []
              : [row(markerOf(colors.lines[line.color - 1]), line.name, asked)];
          }),
        ];
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
      ...(input.logarithmic
        ? // powers of ten, chosen by the library around the values
          { type: 'log', logBase: 10 }
        : bars
          ? // an amount starts at nothing: a bar measured from anywhere else lies about its size
            { type: 'value', min: 0 }
          : {
              type: 'value',
              // around the values, not from zero: a room moves by a degree or two
              scale: true,
              // the band is part of the picture also while every reading lies on one side of it
              min: (extent: { min: number }) =>
                Math.max(
                  input.bounds?.min ?? -Infinity,
                  Math.floor(band === undefined ? extent.min : Math.min(extent.min, band.low)) - 1,
                ),
              max: (extent: { max: number }) =>
                Math.min(
                  input.bounds?.max ?? Infinity,
                  Math.ceil(band === undefined ? extent.max : Math.max(extent.max, band.high)) + 1,
                ),
            }),
      axisLabel: { ...text, formatter: (at: number) => withUnit(axisValue.format(at), input.unit) },
      splitLine: { lineStyle: { color: colors.grid, opacity: 0.35 } },
    },
    series: input.lines.map((line, index) =>
      line.bars
        ? {
            type: 'bar',
            id: line.key,
            name: line.name,
            data: line.points,
            barMaxWidth: 10,
            emphasis: { disabled: true },
          }
        : {
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
          },
    ),
  };
}
