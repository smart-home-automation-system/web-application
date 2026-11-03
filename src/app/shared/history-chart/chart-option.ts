import type { EChartsCoreOption } from 'echarts/core';

import { dateTimeFormat, numberFormat } from '../../core/i18n/intl-formats';
import { ChartLine, LinePoint, bridgesOf, gapAround } from './chart-data';

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
  /**
   * What the tooltip says of a line inside one of its gaps, "No readings", in the language of the
   * interface; the gap is not told without it.
   */
  readonly noReadings?: string;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** In a tooltip a value has two decimals at most - what the services round to. */
const VALUE: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 2 };

/** Text for the HTML of a tooltip: every name that goes in is escaped. */
export const escapeHtml = (text: string) =>
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
  return clockTime(at, locale);
}

/** The time of the day alone, as the house had it: `14:20`. */
function clockTime(at: number, locale: string): string {
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

/**
 * Nothing at or below zero lies on a logarithmic axis - and the light of the night is 0 lx. Such
 * a point is drawn at 1, the floor of the axis; the tooltip still says what was measured.
 */
const onLogAxis = (points: readonly LinePoint[]): LinePoint[] =>
  points.map(([at, value]) => [at, value === null ? null : Math.max(value, 1)]);

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
      // one entry per line: the bridges of its gaps carry its name and get none
      data: input.lines.map((line) => line.name),
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
          readonly seriesIndex?: number;
          readonly dataIndex?: number;
          readonly marker?: string;
        }[];
        /** The value of the point as measured - on a log axis the drawn one may be lifted to 1. */
        const measuredValue = (hoveredRow: (typeof rows)[number]) =>
          hoveredRow.seriesIndex !== undefined && hoveredRow.dataIndex !== undefined
            ? input.lines[hoveredRow.seriesIndex]?.points[hoveredRow.dataIndex]?.[1]
            : hoveredRow.value?.[1];
        // The moment is that of a measured point. A line of steps has points at its edges only,
        // so ECharts lists it where the pointer is near an edge and nowhere else - or twice,
        // where two steps share one: what it asks for at the moment is read off the line here.
        // a bridge of a gap is no reading, and has no row of its own
        const measured = rows.filter(
          (row) =>
            !steps.has(row.seriesName ?? '') &&
            (row.seriesIndex === undefined || row.seriesIndex < input.lines.length),
        );
        const at = (measured[0] ?? rows[0])?.value?.[0];
        const row = (marker: string, name: string, reading: number) =>
          // the markers are markup of ECharts and of this file; a name is ours, and escaped
          // all the same
          `${marker}${escapeHtml(name)}: <strong>${withUnit(value.format(reading), unit)}</strong>`;
        /** A line inside one of its gaps: no value, the readings on both sides of the silence. */
        const gapRow = (hoveredRow: (typeof rows)[number]) => {
          const line =
            hoveredRow.seriesIndex === undefined ? undefined : input.lines[hoveredRow.seriesIndex];
          const gap =
            line === undefined || hoveredRow.dataIndex === undefined
              ? undefined
              : gapAround(line.points, hoveredRow.dataIndex);
          return gap === undefined || input.noReadings === undefined
            ? []
            : [
                `${hoveredRow.marker ?? ''}${escapeHtml(hoveredRow.seriesName ?? '')}: ` +
                  `<strong>${escapeHtml(input.noReadings)}</strong> ` +
                  escapeHtml(gapSpan(gap.from, gap.to, input.locale)),
              ];
        };
        const lines = [
          ...measured.flatMap((hoveredRow) => {
            const reading = measuredValue(hoveredRow);
            return typeof reading === 'number'
              ? [row(hoveredRow.marker ?? '', hoveredRow.seriesName ?? '', reading)]
              : gapRow(hoveredRow);
          }),
          ...input.lines.flatMap((line) => {
            const asked = line.dashed && at !== undefined ? valueAt(line.points, at) : undefined;
            return asked === undefined
              ? []
              : [row(markerOf(colors.lines[line.color - 1]), line.name, asked)];
          }),
        ];
        // inside a gap the moment is the middle the gap was marked at - no reading: its rows say
        // when the readings around it were, and no time of its own is printed
        const inGap =
          measured.length > 0 &&
          measured.every((hoveredRow) => typeof measuredValue(hoveredRow) !== 'number');
        const header = at === undefined || inGap ? [] : [escapeHtml(tooltipTime(at, input.locale))];
        return [...header, ...lines].join('<br>');
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
    series: [
      ...input.lines.map(seriesOf(input, colors)),
      // after every line, so that a line keeps the index of its place in `input.lines`
      ...input.lines.flatMap((line) => {
        const bridges = line.bars || line.dashed ? [] : bridgesOf(line.points);
        const color = colors.lines[line.color - 1];
        return bridges.length === 0
          ? []
          : [
              {
                type: 'line',
                id: `${line.key}-gaps`,
                name: line.name,
                data: input.logarithmic ? onLogAxis(bridges) : bridges,
                connectNulls: false,
                showSymbol: false,
                silent: true,
                tooltip: { show: false },
                // dotted, thin and faint: the dashed line is the schedule of a room
                lineStyle: { width: 1.5, type: 'dotted', opacity: 0.6, color },
                itemStyle: { color },
                emphasis: { disabled: true },
              },
            ];
      }),
    ],
  };
}

/** The readings on both sides of a gap, the second without its day when it is the same day. */
export function gapSpan(from: number, to: number, locale: string): string {
  const sameDay = Math.floor(from / DAY_MS) === Math.floor(to / DAY_MS);
  const end = sameDay ? clockTime(to, locale) : tooltipTime(to, locale);
  return `(${tooltipTime(from, locale)} – ${end})`;
}

function seriesOf(input: ChartInput, colors: ChartColors) {
  const band = input.band;
  return (line: ChartLine, index: number) =>
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
          data: input.logarithmic ? onLogAxis(line.points) : line.points,
          // a break in the line is a gap in the readings: its bridge is a series of its own
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
        };
}
