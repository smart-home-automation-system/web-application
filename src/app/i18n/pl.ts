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
    myRoom: 'Mój pokój',
    settings: 'Ustawienia',
    about: 'O aplikacji',
  },
  language: {
    change: 'Zmień język',
    loadFailed: 'Nie udało się wczytać języka. Załaduj aplikację ponownie i spróbuj jeszcze raz.',
  },
  overview: {
    title: 'Przegląd',
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
  profiles: {
    title: 'Wybierz swój profil',
    members: 'Domownicy',
    loading: 'Wczytywanie domowników',
    empty: 'W rejestrze domowników nie ma jeszcze nikogo.',
    retry: 'Spróbuj ponownie',
    switch: 'Zmień profil',
    role: {
      admin: 'Administrator',
      resident: 'Domownik',
    },
  },
  personalLink: {
    title: 'Link osobisty',
    opening: 'Otwieranie profilu',
    unknownTitle: 'Ten link nie otwiera żadnego profilu',
    unknownText:
      'Nikt z domowników nie jest zarejestrowany pod tym imieniem albo profil został wyłączony. Poproś administratora o aktualny link.',
    unavailableTitle: 'Nie udało się otworzyć profilu',
    continue: 'Przejdź do aplikacji',
  },
  install: {
    title: 'Dodaj do ekranu początkowego',
    lead: 'Ikona dodana z tej strony otwiera aplikację od razu w Twoim profilu.',
    steps: 'Jak ją dodać',
    share: 'Dotknij przycisku Udostępnij w przeglądarce.',
    add: 'Wybierz „Do ekranu początkowego”.',
    confirm: 'Dotknij „Dodaj”.',
    continue: 'Dalej w przeglądarce',
  },
  connection: {
    offline: 'Brak połączenia z domem. Sprawdź Wi-Fi lub VPN.',
    lastContact: 'Ostatnie połączenie: {{ time }}',
    retry: 'Spróbuj ponownie',
  },
  update: {
    available: 'Nowa wersja aplikacji jest gotowa.',
    reload: 'Wczytaj ponownie',
  },
  myRoom: {
    title: 'Mój pokój',
    rooms: 'Twoje pokoje',
    noRooms:
      'Do twojego profilu nie przypisano jeszcze żadnego pokoju. Pokoje przypisuje administrator domu.',
  },
  settings: {
    title: 'Ustawienia',
    appearance: {
      title: 'Wygląd',
      hint: 'Kolory same podążają za porą roku oraz jasnym lub ciemnym trybem urządzenia. Wybór dokonany tutaj służy do podglądu i jest pamiętany tylko w tej przeglądarce.',
      scheme: 'Tryb kolorów',
      schemeSystem: 'Systemowy',
      schemeLight: 'Jasny',
      schemeDark: 'Ciemny',
      season: 'Pora roku',
      seasonAuto: 'Automatycznie',
      seasonNow: 'Według kalendarza, teraz: {{ season }}',
      reset: 'Wróć do automatycznych',
      photos: 'Zdjęcia pod widokami',
      photosOn: 'Pokazywane',
      photosOff: 'Ukryte',
      photosHint:
        'Każdy widok ma pod szkłem zdjęcie swojego miejsca. Wyłącz je na urządzeniu, które rysuje je powoli.',
    },
    palette: {
      title: 'Paleta',
      lead: 'Kolory pory roku widocznej na ekranie.',
      primary: 'Główny',
      secondary: 'Dodatkowy',
      charts: 'Serie wykresów',
      domains: 'Domeny',
    },
  },
  domain: {
    heating: 'Ogrzewanie',
    water: 'Ciepła woda',
    boiler: 'Kotłownia',
    household: 'Domownicy',
  },
  season: {
    spring: 'Wiosna',
    summer: 'Lato',
    autumn: 'Jesień',
    winter: 'Zima',
  },
  about: {
    title: 'O aplikacji',
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
    },
  },
};
