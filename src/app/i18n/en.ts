/**
 * English texts - the default language and the source of truth for the keys: `pl.ts` has to
 * carry exactly the same ones (the compiler and `translations.spec.ts` both check).
 *
 * `{{ name }}` is a placeholder filled in by the caller. Keep keys grouped by the feature that
 * owns the text; a text used by two features belongs to neither and goes to a shared group.
 */
export const en = {
  app: {
    skipToContent: 'Skip to content',
  },
  nav: {
    label: 'Main navigation',
    overview: 'Overview',
    settings: 'Settings',
    about: 'About',
  },
  language: {
    change: 'Change language',
    loadFailed: 'The language could not be loaded. Reload the application and try again.',
  },
  overview: {
    title: 'Overview',
    lead: 'The state of the house at a glance. More tiles arrive with the next dashboards.',
    systems: 'House systems',
    heating: {
      title: 'Heating system',
      enabled: 'Enabled',
      disabled: 'Disabled',
      switchedOn: 'Switched on: {{ time }}',
      switchedOff: 'Switched off: {{ time }}',
      loading: 'Loading the heating status',
    },
  },
  settings: {
    title: 'Settings',
    lead: 'How the application looks in this browser.',
    appearance: {
      title: 'Appearance',
      hint: 'The colours follow the season and the light or dark setting of the device by themselves. A choice made here is for preview and is kept in this browser only.',
      scheme: 'Colour scheme',
      schemeSystem: 'System',
      schemeLight: 'Light',
      schemeDark: 'Dark',
      season: 'Season',
      seasonAuto: 'Automatic',
      seasonNow: 'By the calendar, now: {{ season }}',
      reset: 'Back to automatic',
    },
    palette: {
      title: 'Palette',
      lead: 'The colours of the season on screen.',
      primary: 'Primary',
      secondary: 'Secondary',
      charts: 'Chart series',
    },
  },
  // names of the seasons, as a label and inside a sentence
  season: {
    spring: 'Spring',
    summer: 'Summer',
    autumn: 'Autumn',
    winter: 'Winter',
  },
  about: {
    title: 'About',
    lead: 'The build of the application running in this browser.',
    version: 'Version',
    commit: 'Commit',
    built: 'Built',
    localBuild: 'local build',
  },
  notFound: {
    title: 'Page not found',
    text: 'There is nothing at this address. The link may be outdated or mistyped.',
    action: 'Go to the overview',
  },
  errorPage: {
    title: 'Something went wrong',
    text: 'The page could not be opened. Reloading the application usually helps.',
    action: 'Reload the application',
  },
  freshness: {
    updated: 'Updated {{ age }}',
    outOfDate: 'Out of date - last update {{ age }}',
    noData: 'No data received',
    waiting: 'Waiting for data',
    justNow: 'just now',
  },
  apiError: {
    network: 'The server cannot be reached. Check the Wi-Fi or VPN connection.',
    server: 'The service is not available right now (error {{ status }}).',
    invalidResponse: 'The server sent an answer the application does not understand.',
    refused: 'The request was refused (error {{ status }}).',
    unexpected: 'Something went wrong in the application.',
  },
  // labels of Angular Material's own controls
  material: {
    paginator: {
      itemsPerPage: 'Items per page:',
      nextPage: 'Next page',
      previousPage: 'Previous page',
      firstPage: 'First page',
      lastPage: 'Last page',
      range: '{{ start }} – {{ end }} of {{ total }}',
      emptyRange: '0 of {{ total }}',
    },
    datepicker: {
      calendar: 'Calendar',
      openCalendar: 'Open calendar',
      closeCalendar: 'Close calendar',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
      previousYear: 'Previous year',
      nextYear: 'Next year',
      previousMultiYear: 'Previous 24 years',
      nextMultiYear: 'Next 24 years',
      switchToMonthView: 'Choose date',
      switchToMultiYearView: 'Choose month and year',
    },
  },
};
