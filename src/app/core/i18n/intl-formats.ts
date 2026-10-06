/**
 * `Intl` formatters are expensive to build and cheap to use, and the pipes that need them run on
 * every refresh of a view - so each combination of locale and options is built once.
 */
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return cached(dateTimeFormats, locale, options, () => new Intl.DateTimeFormat(locale, options));
}

export function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(numberFormats, locale, options, () => new Intl.NumberFormat(locale, options));
}

export function relativeTimeFormat(
  locale: string,
  options: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  return cached(
    relativeTimeFormats,
    locale,
    options,
    () => new Intl.RelativeTimeFormat(locale, options),
  );
}

function cached<T>(cache: Map<string, T>, locale: string, options: object, create: () => T): T {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key);
  if (format === undefined) {
    format = create();
    cache.set(key, format);
  }
  return format;
}
