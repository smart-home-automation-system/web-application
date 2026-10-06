import { Messages } from './messages';

/**
 * Polish texts. The type makes a missing or an extra key a compile error; see `en.ts` for the
 * rules. This file is loaded only when somebody chooses Polish.
 */
export const pl: Messages = {
  app: {
    skipToContent: 'Przejdź do treści',
  },
  nav: {
    label: 'Nawigacja główna',
    overview: 'Przegląd',
    about: 'O aplikacji',
  },
  language: {
    change: 'Zmień język',
    loadFailed: 'Nie udało się wczytać języka. Załaduj aplikację ponownie i spróbuj jeszcze raz.',
  },
  overview: {
    title: 'Przegląd',
    lead: 'Stan domu w jednym miejscu. Kolejne kafle pojawią się razem z następnymi panelami.',
    systems: 'Systemy domu',
    heating: {
      title: 'Ogrzewanie',
      enabled: 'Włączone',
      disabled: 'Wyłączone',
      switchedOn: 'Włączono: {{ time }}',
      switchedOff: 'Wyłączono: {{ time }}',
      loading: 'Wczytywanie stanu ogrzewania',
    },
  },
  about: {
    title: 'O aplikacji',
    lead: 'Wersja aplikacji działająca w tej przeglądarce.',
    version: 'Wersja',
    commit: 'Commit',
    built: 'Zbudowano',
    localBuild: 'build lokalny',
  },
  notFound: {
    title: 'Nie znaleziono strony',
    text: 'Pod tym adresem nic nie ma. Link może być nieaktualny albo błędnie wpisany.',
    action: 'Przejdź do przeglądu',
  },
  errorPage: {
    title: 'Coś poszło nie tak',
    text: 'Nie udało się otworzyć strony. Zwykle pomaga ponowne załadowanie aplikacji.',
    action: 'Załaduj aplikację ponownie',
  },
  freshness: {
    updated: 'Zaktualizowano {{ age }}',
    outOfDate: 'Dane nieaktualne - ostatnia aktualizacja {{ age }}',
    noData: 'Brak danych',
    waiting: 'Oczekiwanie na dane',
    justNow: 'przed chwilą',
  },
  apiError: {
    network: 'Nie można połączyć się z serwerem. Sprawdź połączenie Wi-Fi lub VPN.',
    server: 'Usługa jest teraz niedostępna (błąd {{ status }}).',
    invalidResponse: 'Serwer przysłał odpowiedź, której aplikacja nie rozumie.',
    refused: 'Żądanie zostało odrzucone (błąd {{ status }}).',
    backendMessage: '{{ message }}',
    unexpected: 'W aplikacji wystąpił błąd.',
  },
  material: {
    paginator: {
      itemsPerPage: 'Pozycji na stronie:',
      nextPage: 'Następna strona',
      previousPage: 'Poprzednia strona',
      firstPage: 'Pierwsza strona',
      lastPage: 'Ostatnia strona',
      range: '{{ start }} – {{ end }} z {{ total }}',
      emptyRange: '0 z {{ total }}',
    },
    datepicker: {
      calendar: 'Kalendarz',
      openCalendar: 'Otwórz kalendarz',
      closeCalendar: 'Zamknij kalendarz',
      previousMonth: 'Poprzedni miesiąc',
      nextMonth: 'Następny miesiąc',
      previousYear: 'Poprzedni rok',
      nextYear: 'Następny rok',
      previousMultiYear: 'Poprzednie 24 lata',
      nextMultiYear: 'Następne 24 lata',
      switchToMonthView: 'Wybierz datę',
      switchToMultiYearView: 'Wybierz miesiąc i rok',
      startDate: 'Data początkowa',
      endDate: 'Data końcowa',
    },
  },
};
