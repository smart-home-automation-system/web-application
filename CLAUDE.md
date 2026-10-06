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
- TypeScript strict, SCSS, Angular Material (Material 3, light + dark following the system)
- Roboto and Material Symbols are **self-hosted** (`@fontsource/roboto`,
  `@material-symbols/font-400`) — the application runs on a LAN and its CSP allows this origin
  only, so nothing may be loaded from a CDN
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
  `TranslatableText` (`{ key, params }`) for a sentence with values; the template translates it
  with `t(text.key, text.params)`. Code that needs the words themselves (the tab title, the
  Material labels) reads `LanguageStore.language()` in an `effect` and calls
  `TranslocoService.translate` — the signal changes only after the texts are in memory.
- **Adding a text**: add the key to `en.ts`; the build then fails until `pl.ts` has it too
  (`pl` is typed with the keys of `en`). `translations.spec.ts` additionally checks that both
  have the same placeholders and that nothing is left untranslated or empty. A missing
  translation is logged and fails the browser tests.
- **Dates and numbers follow the language, through three pipes** — never Angular's `date`,
  `number` or `percent`, which are tied to a fixed `LOCALE_ID`:
  `houseDateTime` (a backend `LocalDateTime`, shown as house wall-clock time), `localDateTime`
  (a real instant, shown in the browser zone) and `localNumber`. They are impure on purpose (the
  language is not an argument) and cheap: formatters are cached in `core/i18n/intl-formats.ts`,
  which is also what any other code uses instead of `new Intl.…`. English formats as `en-GB` —
  24-hour clock, day before month.
- **Units**: write the symbol next to the number (`°C`, `%`), the same in both languages. Do not
  use the `unit` style of `Intl.NumberFormat` — in Polish it prints degrees Celsius as `st. C`.
- **What the backend says stays in English**: a 4xx message is shown as sent (the backend speaks
  English only, by the org rule). Where a refusal has a `code`, map the code to a translated
  text of our own instead.
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
- `npm run build` + `npm run check:bundle` — production build and its guard
- `npm run e2e` — Playwright, desktop and phone projects; screenshots in `test-results/screenshots/`

## Workflow (strict)

1. Never commit to `main`. Every change goes on a **`feature/HAS-<n>`** branch, where
   `<n>` is the Jira task number (HAS project) — this is an org-wide rule. If no Jira
   task covers the change, have one created first (`jira-backlog`) or ask the user.
2. Definition of done for any change: lint, unit tests, production build, bundle check and
   the Playwright suite pass; `/code-review` of the own diff (and `/security-review` before a
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
