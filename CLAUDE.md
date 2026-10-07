# web-application

Angular frontend for the Smart Home Automation System. **This is the one repository where
Claude has full implementation autonomy** — the user is a backend (Java/Spring) developer
and relies on the rules below for consistency. Follow them strictly; when a new
architectural decision is needed, propose it in the PR description rather than silently
inventing a pattern.

The plan this application is built from lives in Jira (HAS project, tasks labelled
`frontend`). Start from the task; it carries the decisions the owner made.

## Stack

- Angular 22, standalone components, **zoneless** change detection, signals
- TypeScript strict, SCSS, Angular Material components dressed in the **"Zorza" look** (owner's
  choice, 2026-10-07, HAS-208: a deep page glowing in the colours of the season, cards of frosted
  glass, a colour per domain of the house, the navigation in a panel on the left — not Angular
  Material's own Material 3 and no longer MUI), light + dark following the system — see "Theme"
  below
- Plus Jakarta Sans and Material Symbols are **self-hosted**
  (`@fontsource-variable/plus-jakarta-sans`, `@material-symbols/font-400`) — the application runs
  on a LAN and its CSP allows this origin only, so nothing may be loaded from a CDN. The font
  faces are declared in `_zorza.scss` (latin and latin-ext only), not through the package's
  stylesheet, which would ship Cyrillic and Vietnamese files too
- Two languages, switched at runtime: Transloco (`@jsverse/transloco`), English by default,
  Polish on choice — see "Languages" below
- Unit tests: Vitest (`ng test`); browser tests: Playwright (`e2e/`); no SSR
- Runtime: static files in an `nginx-unprivileged` image

## Architecture rules

Folder layout (feature-based):

```
src/app/
  core/           # singletons: API client, polling, config, layout shell, i18n, time, build info
  shared/         # reusable presentational components, pipes, pure helpers
  data-access/    # one injectable class per backend domain (heating, water, boiler, …)
  features/       # routed features, lazy-loaded: overview, about, …
  i18n/           # the texts: en.ts (source of the keys), pl.ts
src/theme/        # the theme: _zorza.scss (the look), _seasons.scss (the colours)
src/mocks/        # mock API: fixtures and handlers, never part of a production bundle
src/testing/      # helpers for unit tests (i18n)
e2e/              # Playwright tests
```

- **Data access**: components NEVER use `HttpClient` or `ApiClient` directly. Every backend
  domain gets a class in `data-access/` (`HeatingApi`), which calls `ApiClient` with paths
  relative to the gateway base path (`/heating`, not `/home/heating`).
- **Polling**: a value that has to stay fresh is exposed as `watchX(): PollingResource<T>`,
  built with `pollingResource()` (`core/api/polling-resource.ts`). The caller invokes it in a
  field initialiser, so the polling lives exactly as long as the component. It pauses while the
  tab is hidden. `pollingResource` is the only place that knows the transport — a switch to SSE
  replaces that function and nothing else.
- **Every polled view shows its freshness**: `<app-data-freshness>` with the resource's
  `lastUpdated` and `stale`. A value without its age reads as current when the backend has been
  down for an hour. On an error the last value stays on screen, marked stale, next to the message.
- **Timeouts**: `ApiClient` fails a call that gets no answer within `requestTimeoutMs` (10 s) as a
  `network` error and aborts it. A request that is accepted and never answered is the outage that
  otherwise looks like "still loading" forever.
- **Errors**: every failed call is an `ApiError` (`core/api/api-error.ts`) with a `kind`
  (`network`, `server`, `client`, `invalid-response`, `unexpected`), the status and the backend
  messages with their `code`. Branch on `code` (`error.hasCode('…')`), never on message text.
  Turn it into a sentence with `describeApiError` (it returns a text to translate); what a failing
  service (5xx) says about itself never goes on screen.
- **Date-times from the backend are house wall-clock times** (`LocalDateTime`, no offset). Never
  `new Date(text)` and never Angular's `date` pipe on them — both shift the value into the
  browser zone. Display with the `houseDateTime` pipe. Computing the *age* of such a value needs
  the zone of the house (an offset has to come from somewhere); that conversion does not exist
  yet and is added, with tests around both DST changes, by the first view that shows one.
- **The API types are promises, not checks**: `ApiClient.get<T>` validates nothing. Model a field
  as optional wherever the backend may omit it (`@JsonInclude(NON_NULL)` is common there), and
  take the shape from a real answer of the gateway, not from the Java class name.
- **Routes**: lazy-loaded with `loadComponent`, each with a `title` — the **key** of its text,
  not the text. **No route may start with `home`** — the ingress sends `/home` to the API gateway
  (a test pins this). A new destination goes into `NAV_ITEMS` (`core/layout/navigation.ts`, label
  as a key) together with its route; the phone layout shows them in a bottom bar that holds five.
- **Layout**: the shell renders both navigations and CSS shows one (side list from 840 px, bottom
  bar below). Use the `--mat-sys-*` variables for every colour and font — never a literal — so
  themes can change them. Global building blocks (`.page-header`, `.message-page`) are in
  `src/styles.scss`.
- **Profiles, no login** (HAS-193): household-member profiles chosen by a personal link,
  persisted in the browser; roles are UI-only until the gateway validates tokens.
- **Future auth**: keep a single extension point — an HTTP interceptor + route guard in
  `core/` — so token auth (api-gateway + cholewa-security) can be added without touching
  features.
- **State**: signals. Component-local state stays in the component; cross-feature state
  lives in small injectable stores (`core/` or the owning feature).
- Modern Angular only: `input()`/`output()`/`inject()`, built-in control flow
  (`@if`/`@for`), `ChangeDetectionStrategy.OnPush`, no NgModules, no constructor injection,
  no `any`. Files and classes carry no `.component` / `.service` suffix (`shell.ts`, `Shell`).
- Desktop-first layouts, but every view must remain usable on a phone (390 px wide).

## Theme

The components are Angular Material; the look is "Zorza" (aurora), and the colours follow the
season. Both are nothing but values of CSS variables, in two files:

- **`src/theme/_zorza.scss` — the look.** The type scale (Plus Jakarta Sans, heavy tight
  headings), one radius per role (24 px cards, 14 px controls, pill buttons), soft wide shadows
  and the details of single components (glass cards, the tinted navigation entry, the segmented
  control), given as values of `--mat-sys-*` and of component variables through Material's
  `*-overrides` mixins. **Restyle a component there, through its variables** — a selector
  reaching into Material's DOM is the last resort (two exist, in `components`: the blur of a
  card, and the gradient of a filled button) and breaks on an upgrade. Material's own component
  styles are appended **after** this stylesheet, so a rule of equal specificity on one of its
  classes silently loses (`.mat-mdc-card { border }` did) — prefer the variable, or an appearance
  that has one: every card is `appearance="outlined"`, because only the outlined card has an edge
  to colour. A Material component used for the first time gets its overrides there, in the same
  task. `--mat-sys-corner-full` is deliberately left alone: it keeps round things round.
- **`src/theme/_seasons.scss` — the colours.** A neutral set (the deep page and its pale
  counterpart, the glass as it reads over the page, text, outline, error), per season a primary
  and a secondary colour, each with a light-scheme and a dark-scheme shade — spring green, summer
  gold, autumn rust, winter blue, four hues told apart at a glance in either scheme — and the
  **domains**: `--app-domain-heating` / `-water` / `-boiler` / `-household` with
  `--app-on-domain`, the same in every season. Everything else (containers, "on" colours) is
  derived there. `mat.theme()` is called **without colours** — no palette of Material's is in
  the build. Every colour is written as `light-dark(<light>, <dark>)`, so one declaration serves
  both schemes. The dark scheme is the one the look was designed in; the light scheme keeps its
  structure on a pale page.
- **The glass.** `--mat-sys-surface*` are opaque — what Material components and the contrast
  check work with — and stand for a sheet of glass as it reads over the plain page; the
  translucent colour a card is actually painted with is `--app-glass` (`--app-glass-panel` for
  the navigation, `--app-glass-edge` for the line along an edge), blurred by `--app-glass-blur`.
  The glow behind everything is `--app-glow`, radial gradients of the season's two colours,
  painted by the shell on a layer **fixed to the screen and `100lvh` tall** — not on the frame,
  which follows the dynamic viewport of a phone: painted there, the gradients (sized in `vh`,
  placed in % of the height) resized and moved every time the toolbar of iOS Safari slid in or
  out (0.4.0). A later task lays a photo of the view under that glow (HAS-209) — on the same
  layer, for the same reason.
- **A domain card** (a tile about heating, hot water, the boiler room or the household) carries
  `card--domain` plus a class of its own setting `--app-domain` (`.tile--heating
  { --app-domain: var(--app-domain-heating) }`): the colour runs along its top edge and tints it;
  its avatar is a `domain-badge` — a `<div mat-card-avatar>` *wrapping* the `<mat-icon>`, never
  the icon itself (Material's `.mat-icon { display }` beat the badge's `display: flex` in 0.4.0
  and the icon sat in the corner). Both blocks live in `src/styles.scss`. The domain colour
  is for the card and its badge, never for text — text on glass stays `on-surface`.
- **Two attributes of `<html>`** select what is painted, both set by `ThemeStore`
  (`core/theme/`): `data-season` (always) and `data-color-scheme` (only while the system setting
  is overridden). The season comes from the browser clock (`seasonOf`: 21 Mar / 22 Jun / 23 Sep
  / 22 Dec), re-read at midnight and whenever the tab becomes visible. The override — season
  and scheme, on the Settings page — is for preview and lives in `localStorage['smart-home.theme']`.
- **Application variables** next to Material's: `--app-bar` / `--app-on-bar` (the colour of the
  page, which the status bar of a phone continues — there is no app bar any more) and
  `--app-chart-1` … `-5` (chart series, derived from the season: **a chart takes its colours
  from these, in order**). `--app-bar-light` / `--app-bar-dark` exist as plain values because
  `ThemeStore` copies the one in use into `<meta name="theme-color">`, which understands neither
  `var()` nor `light-dark()`.
- **Selected means tinted primary**: Material paints selected things (the open navigation entry,
  a pressed toggle) with the "secondary container"; here that pair is derived from the primary.
  The season's secondary colour is the accent the glow and the filled button's gradient run to
  (`--mat-sys-secondary`, `--mat-sys-tertiary`), never a default for text.
- **The shell is one panel**, laid out by CSS: a column on the left from 840 px (brand,
  navigation list, language), a bar across the top below that (brand and language, the
  navigation then being the bottom bar). One DOM for both, so nothing is rendered twice.
- **Contrast is checked, not assumed**: `npm run check:contrast` reads the colours back from the
  production stylesheet and fails below WCAG AA (4.5:1 text, 3:1 control outlines) in any of the
  eight variants. A new combination of foreground and background — text on a surface level not
  listed yet — is added to `PAIRS` in `scripts/check-contrast.mjs`. Text in the primary colour
  on a *tinted* background does not pass in every season: use the `on-…-container` colour there.
- **Tests**: Playwright pins the date with `page.clock` (a test that depends on the season must
  not depend on the day it runs) and starts in a variant with `startWithTheme(page, …)`. In a
  unit test `ThemeStore` works without styles and without `matchMedia`; stub the latter to test
  the system scheme.

## Languages

English is the default — on a first visit always, whatever the language of the browser — and
Polish can be chosen from the toolbar. The choice changes the open page without a reload and is
kept in `localStorage['smart-home.language']` (HAS-193 scopes it per profile).

- **No literal text in a template or in code that ends up on screen.** Every text is a key in
  `src/app/i18n/en.ts` — the source of the keys — and `pl.ts`, grouped by the feature that owns
  it. The only exceptions: the product name (`APP_NAME`) and the names of the languages, which
  are shown in their own words.
- **In a template**: wrap it in `<ng-container *transloco="let t">` and write `t('about.title')`,
  `t('overview.heating.switchedOn', { time: … })`; attributes too (`[attr.aria-label]="t(…)"`).
  Not the `transloco` pipe — one directive per template re-renders it on a language change.
- **In code**: return the key, not the words — `MessageKey` for a label or a route title,
  `DisplayText` for a sentence, shown with the `displayText` pipe
  (`{{ describeApiError(error) | displayText }}`). Code that needs the words themselves (the tab
  title, the Material labels) reads `LanguageStore.language()` in an `effect` and calls
  `TranslocoService.translate` — the signal changes only after the texts are in memory.
- **Words from outside are never a translation parameter.** Transloco searches the text it has
  just substituted for more placeholders: a backend message containing `{{ foo }}` loses it, and
  one containing `{{ message }}` — its own parameter name — never returns, freezing the tab.
  Text the application did not write (a backend message, later a device or member name inside a
  sentence) is a `DisplayText` of the `literal` kind, printed as it is. Parameters are numbers
  and text of our own making only (a formatted date, a translated word).
- **Adding a text**: add the key to `en.ts`; the build then fails until `pl.ts` has it too
  (`pl` is typed with the keys of `en`). `translations.spec.ts` additionally checks that both
  have the same placeholders and that nothing is left untranslated or empty. Keys in TypeScript
  are checked by the compiler (`MessageKey`); keys in templates are plain strings, so
  `npm run check:i18n` reads every template and fails on a key that does not exist — a typo
  would otherwise show only in the one view that has it.
- **Dates and numbers follow the language, through three pipes** — never Angular's `date`,
  `number` or `percent`, which are tied to a fixed `LOCALE_ID`:
  `houseDateTime` (a backend `LocalDateTime`, shown as house wall-clock time), `localDateTime`
  (a real instant, shown in the browser zone) and `localNumber`. They are impure on purpose (the
  language is not an argument) and cheap all the same: each remembers its last result
  (`memoLast`), and formatters are cached in `core/i18n/intl-formats.ts`, which is also what any
  other code uses instead of `new Intl.…`. English formats as `en-GB` — 24-hour clock, day
  before month.
- **Units**: write the symbol next to the number (`°C`, `%`), the same in both languages. Do not
  use the `unit` style of `Intl.NumberFormat` — in Polish it prints degrees Celsius as `st. C`.
- **What the backend says stays in English**: a 4xx message is shown as sent (the backend speaks
  English only, by the org rule). Where a refusal has a `code`, map the code to a translated
  text of our own instead.
- **A control is named by what is written on it.** An `aria-label` replaces the visible text in
  the accessible name; where a button shows text (the `EN` of the language button) add the rest
  as `.visually-hidden` text inside it instead, with `&ngsp;` so the words do not run together.
- **Angular Material's own labels** (paginator, date picker) are translated in
  `core/i18n/material-intl.ts`, which also gives the date picker the locale. A Material control
  with built-in texts used for the first time (sort header, stepper) gets its `…Intl` class there.
- **Tests**: `provideI18nTesting()` in the providers of any unit test that renders a template —
  it is the real i18n, so the test reads what a user reads — and `await useLanguage('pl')` to
  switch (`src/testing/i18n.ts`). In Playwright: `startIn(page, 'pl')` (`e2e/support.ts`).
  Verify a new view in both languages; Polish texts are longer and break layouts first.
- **A third language**: an entry in `LANGUAGES` and a case in the loader
  (`core/i18n/languages.ts`), plus its file. English is in the main bundle; every other language
  is a chunk downloaded when chosen.

## Mock API

`npm run start:mock` builds the `mock` configuration, whose only difference is a file
replacement: `core/api/mock-api.ts` (no interceptors) becomes `src/mocks/mock-api.ts`. That is
the one door through which mock code enters a bundle; `npm run check:bundle` fails if it shows
up in a production build.

- Every endpoint the application calls gets a handler in `src/mocks/handlers.ts` and a fixture
  typed with the data-access model — a new call without one answers 404, like the gateway.
- Fixtures mirror real gateway answers in shape and use **invented names and values only**:
  this repository is public, the household is not.
- Failure modes: `localStorage['mock-scenario']` = `offline` | `server-error`.
- Playwright runs against the mock API, so a browser test can never switch a real device.
  **Never point a test at the cluster for anything that writes** (the heating switch, the
  household registry); reading is fine.

## Backend integration

- All HTTP goes through `api-gateway-service`, base path `/home`.
- Dev server proxies `/home` → `http://localhost:6200` (see `proxy.conf.json`); adjust
  target locally, never commit private hosts/IPs — this repo is public. The address the
  application is served at is private infrastructure too: it belongs in `deployment-tools`,
  not here.
- Error bodies follow `cholewa-commons` (`errors[].message`, optional `code`); a routing 404
  of the gateway has a message and no code.

## Delivery

- `Dockerfile`: stage 1 builds with Node, stage 2 is `nginx-unprivileged` on port 8080 with
  `nginx/default.conf`. The build stamps the release tag and commit into
  `core/build-info/build-info.ts` (`scripts/stamp-build-info.mjs`) — shown on the About page,
  the first thing to check after a deploy.
- `nginx/security-headers.conf` holds the Content-Security-Policy (`'self'` only; inline styles
  allowed because Angular needs them, inline scripts not). Consequences: no inline `<script>`,
  no external font / image / script, and `inlineCritical` stays off in `angular.json` (it adds
  an inline event handler). A new kind of resource means a CSP change, tested by `e2e/image.spec.ts`.
- nginx's `add_header` in a `location` drops the inherited ones — every location serving the
  application includes the snippet.
- CI builds the image, starts it read-only and runs `e2e/image.spec.ts` against it in a real
  browser: the only test of nginx (CSP, SPA fallback, caching, `/healthz`). Locally:
  `IMAGE_URL=http://localhost:8080 npm run e2e`.
- **Playwright empties its output folder at the start of every run**, and CI runs it twice. So
  the two kinds of run write side by side (`test-results` / `playwright-report` for the mock
  API, `test-results-image` / `playwright-report-image` for the image), and the screenshots go
  to `screenshots/`, which no run empties by itself (`e2e/global-setup.ts` clears it before the
  run that takes them). A screenshot is always written through `screenshotPath()`
  (`e2e/support.ts`), never to a path of its own. CI uploads them as the artifact
  `screenshots` and fails when there are none - **that artifact is what a PR links to**; check
  that it holds pictures before writing that it does.
- nginx marks as immutable only what the build names with a hash (`main-`, `chunk-`, `styles-`,
  `polyfills-`, `scripts-`, `worker-` in the root, and all of `/media/`). A new kind of hashed
  output needs its prefix added there, or it is served with `no-cache` (slow, never wrong).
- Release → `release.yml` pushes `magikabdul/web-application:<tag>`; the manifest
  (`workshop/web-application.yaml`) is in `deployment-tools`. **Every task ends with a release
  and a deploy**, like the services.

## Commands

- `npm start` — dev server against a gateway (API proxy); `npm run start:mock` — against the mock API
- `npm run lint` — ESLint (sources, templates, e2e)
- `npm test` — unit tests (Vitest; single run when non-interactive)
- `npm run check:i18n` — every translation key used in a template exists
- `npm run build` + `npm run check:bundle` — production build and its guard
- `npm run check:contrast` — WCAG AA contrast of the theme, read from the production build
- `npm run e2e` — Playwright, desktop and phone projects; screenshots in `screenshots/`

## Workflow (strict)

1. Never commit to `main`. Every change goes on a **`feature/HAS-<n>`** branch, where
   `<n>` is the Jira task number (HAS project) — this is an org-wide rule. If no Jira
   task covers the change, have one created first (`jira-backlog`) or ask the user.
2. Definition of done for any change: lint, translation-key check, unit tests, production build, bundle check,
   contrast check and the Playwright suite pass; `/code-review` of the own diff (and `/security-review` before a
   release), outcome recorded on the PR; visual verification in a browser for UI changes —
   desktop and phone width, light and dark — with screenshots attached to the PR.
3. Open a PR to `main` with a plain-language description of what changed and why —
   **the user personally reviews and merges every PR**, so explain frontend-specific
   decisions in terms a backend developer can judge. Never merge, never offer to.
4. After the merge: release per the `release` skill, deploy, verify the rollout and the
   version on the About page.
5. CI (`.github/workflows/CI.yml`) runs all of the above on feature-branch pushes and `main`,
   mirroring the org convention; `sonar.yml` analyses PRs and `main`.
6. When unsure about a requirement, ask the owner — never guess.
