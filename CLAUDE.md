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
- **The service worker never sees a backend call**: `ApiClient` sends `ngsw-bypass` with every
  request. Never call the backend around `ApiClient`, and never add a data group to
  `ngsw-config.json` - see "Installed application" below.
- **Whether the house can be reached is one fact**, `ConnectionStore.offline()`
  (`core/api/connection-store.ts`), told by `ApiClient` from how every call ends, and shown by the
  shell as a banner. A view still shows its own error next to its data; it does not build a
  second "offline" state of its own.
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
- **Profiles, no login** — see "Profiles" below. A feature learns who uses the application
  from `ProfileStore.profile()` (name, role, rooms) and from nowhere else.
- **Who may open a page is `data.access` of its route** (`core/profile/access.ts`): `member`
  for every household member, `anyone` / `chooser` for the pages around the profiles — and
  **a route that says nothing is the administrator's alone**, so a new page is closed to
  residents until somebody decides otherwise. Its `NAV_ITEMS` entry carries the same value (a
  test compares them), and `app.routes.spec.ts` lists every page open to others: add to that
  list deliberately.
- **The browser's storage goes through `core/storage/browser-storage.ts`** (`readText` /
  `writeText` / `readJson` / `writeJson` / `watchKey`), never through `localStorage` directly:
  it throws in private mode, holds whatever an older version wrote, and changes under the page
  from another tab. A store keeps its key and the check of what came back (`readJson` answers
  `unknown`; `isRecord` from `core/util/is-record.ts` is the first step of that check).
- **State**: signals. Component-local state stays in the component; cross-feature state
  lives in small injectable stores (`core/` or the owning feature).
- Modern Angular only: `input()`/`output()`/`inject()`, built-in control flow
  (`@if`/`@for`), `ChangeDetectionStrategy.OnPush`, no NgModules, no constructor injection,
  no `any`. Files and classes carry no `.component` / `.service` suffix (`shell.ts`, `Shell`).
- Desktop-first layouts, but every view must remain usable on a phone (390 px wide).

## Profiles

Household members without a login (HAS-193): a personal link `/u/<member>` opens a profile, the
browser remembers it, and the role decides what the interface offers. **It is navigation, not
access control** — the README says so plainly, and nothing here may be described as security.

- **Everything lives in `core/profile/`.** `ProfileStore` holds the active `Profile` (name,
  role, rooms) in `localStorage['smart-home.profile']` — with role and rooms, so the application
  starts as the same person without waiting for the backend, and keeps working while it is away.
  `refresh()` asks the registry (`GET /home/household/profiles`, `HouseholdApi.profiles()`)
  and reconciles: new role or rooms replace the remembered ones, a member who is not in the
  answer loses the profile, a failed call changes nothing. The answer holds the active members
  only - name, `role` (`admin` / `resident`) and `rooms`, left out when there are none - so
  "switched off" and "removed" are one case here. **Never call `GET /home/household`**: the full
  registry carries phone numbers and device MAC addresses (HAS-211), and the mock API answers it
  with 404 so that a browser test fails on it. It runs at every start (not awaited), in the picker and inside
  `open(member)`, which is what a personal link calls. **`open()` of the member already
  remembered answers at once** and asks the registry on the side (HAS-194): their own link is
  the address the installed application starts from, and waiting for the registry there was a
  10-second spinner at every start outside the house. A member switched off since then is
  therefore led to the picker when the registry answers, not to the "link opens nobody" message.
- **One rule, asked in three places**: `redirectFor(access, profile)` answers where somebody is
  sent instead of a page, or `undefined`. `profileGuard` (`canActivateChild` of the shell
  route) asks it on navigation; the shell asks it to list the navigation entries, and again in an
  effect whenever the profile changes — the registry answering with another role, another tab
  opening somebody else's link — so a page its viewer may no longer see is left. Do not add a
  second rule next to it.
- **A resident** reaches `/room` and the pages open to `anyone`; everything else, the picker
  included, redirects to `/room`. A role the application does not know reads as `resident`, the
  one that reaches the least. **The administrator** reaches everything; the name in the panel
  leads to the picker.
- **A member's name is text from outside**: printed as it is (interpolation), never a
  translation parameter, and the name in a link's address is never put on screen at all.
- **Phase 2** (a token in the link, validated by the gateway) changes `ProfileStore.open()`,
  `profileInterceptor` — today a pass-through, registered in `app.config.ts` — and
  `profileGuard`. Nothing outside `core/profile/` may depend on the profile being a name.
- **Tests**: Playwright starts every test as the administrator (`e2e/support.ts`);
  `test.use({ profile: 'resident' })` or `'none'` chooses otherwise, and `startAs(page, …)`
  does it for a page of another context. A unit test that renders the shell puts a profile into
  `localStorage['smart-home.profile']` first, or every address leads to the picker. The image
  test has no backend, so it starts with a remembered profile too.

## Installed application

On the household's iPhones the application is added to the home screen and runs in a window of
its own (HAS-194). Everything about that lives in `core/pwa/`, `core/api/connection-store.ts`,
`core/layout/notices.ts` and `features/install/`.

- **The manifest names no `start_url`, and must not get one.** The icon then opens the address it
  was added from, and that has to be the personal link: an installed application on iOS has its
  own storage, apart from Safari's, so on its first start it knows nobody. `scope` is `/` on
  purpose - its default is the folder of the start address, `/u/`, which the first page behind
  the link already leaves. `check:bundle` fails on either. The fallback the task names, should a
  real iPhone behave differently, is a manifest served per profile.
- **The personal link is the page the application is installed from.** In a tab of Safari on an
  iPhone (`offersHomeScreen`: `navigator.standalone` exists and is false, on a touch screen - a
  property only Apple's engine has, so nothing parses a user agent; every browser on an iPhone
  is built on it, hence the steps say "the browser", not Safari) `PersonalLink` opens the profile, **stays under
  its own address** and shows `InstallInstructions`. Anywhere else, and from the home screen, it
  goes on as before. A page that navigates away before the member taps Share would put the
  wrong address on the home screen - keep that in mind before adding a redirect there.
- **The service worker keeps the application and nothing else** (`ngsw-config.json`): the shell
  prefetched (scripts, styles, fonts, icons), the photos once seen. No data group, ever, and
  `/home` is out of the navigation fallback. Left in the path of an API call the worker would
  also answer a call that got no reply with **a 504 of its own making**, which reads as a failing
  service instead of a house out of reach - hence `ngsw-bypass`. It is registered in production
  builds only (`enabled: !isDevMode()`): the dev server and the mock build have none, so
  **anything about the worker is tested on the container image** (`e2e/image.spec.ts`:
  `workerKeepsTheApplication()` waits until it holds every file).
- **A new kind of file the application needs offline goes into `ngsw-config.json`** - the same
  moment it needs a prefix in nginx. A file missing there works online and is absent offline.
- **`ngsw-worker.js` and `ngsw.json` must stay `no-cache`** in nginx (they are unhashed and take
  the default): a browser that kept either would start the old version after every deploy.
- **The worker serves `index.html` from its cache with the headers it had when cached**, and
  replaces it only when the file changes. A change of `nginx/security-headers.conf` alone does
  not reach installed clients for the document - change the CSP together with something that
  changes `index.html`, or say so in the release.
- **Updates**: `AppUpdate` (`core/pwa/app-update.ts`) turns the worker's `VERSION_READY` into the
  "new version" strip and reloads on request. It asks the server on every return into view and
  hourly - the worker itself looks only when the page is loaded, which an installed application
  hardly ever is. `SwUpdate` is injected as optional, so a unit test needs no provider.
- **The banner**: `ConnectionStore` - any answer, 4xx / 5xx included, means within reach;
  `invalid-response` proves nothing; a call without an answer (`network`) is only a **doubt**.
  Out of reach takes **two unanswered calls in a row, with nothing answered since the first was
  sent** (`ApiClient` passes the time each call was sent): judged call by call, one service that
  hangs behind a healthy gateway made the banner come and go with every poll (found in review -
  the same lesson as the device monitors of the backend). At the first doubt `Notices` asks the
  registry at once, so the second call follows immediately. The last successful call is kept in
  `localStorage['smart-home.last-contact']` (written once a minute at most). The banner goes with
  the next answer, and `Notices` asks the registry every 30 s while it is up, because a page
  without polling asks nothing by itself.
- **A page shown on the strength of what the browser remembers follows the registry afterwards**:
  `PersonalLink` has an effect for it - `unavailable` opens the link by itself once the registry
  answers, `install` turns into `unknown` when the remembered member is gone. The banner's
  probe and the start both ask the registry behind the open page.
- **Known limit**: the worker hands `index.html` to navigations only for addresses without a dot
  (`!/**/*.*`, Angular's default, and a negative pattern cannot be overridden per path). A
  member whose name contains a dot could not start the installed application offline.
- **The notices are `role`-less strips in an `aria-live` region**, outside `<main>`, and the
  region stays rendered while empty (zero padding, not `display: none`) - one that appears
  together with its first words is often not read out. Many browser
  tests ask for *the* `alert` on a page: a second element with that role breaks them all. A page
  with its own "Try again" now shares the name with the banner's button - scope it
  (`page.getByRole('main')`).
- **Icons**: `node scripts/make-icons.mjs` renders all of them from `public/icon.svg`. The
  iPhone's and the maskable one are rendered without the rounded corners - a home screen cuts
  the shape itself and paints transparency black.
- **Tests**: `onAnIPhone(page, …)` (`e2e/support.ts`) defines `navigator.standalone` and a touch
  screen; a unit test does the same on `navigator` and deletes both afterwards.
- **Not decided here, judged on the real phone**: the status bar of the installed application is
  the system's default (no `apple-mobile-web-app-status-bar-style`; the translucent variant
  draws white text over a pale page).

## Theme

The components are Angular Material; the look is "Zorza" (aurora), and the colours follow the
season. Both are nothing but values of CSS variables, in two files:

- **`src/theme/_zorza.scss` — the look.** The type scale (Plus Jakarta Sans, heavy tight
  headings, two steps smaller than Material's **and on a 14 px root** (`styles.scss`) since
  HAS-209 — the owner asked for each reduction after seeing the previous one on the live page,
  on a 2560 px monitor and on an emulated phone; body text is 10.5 px, which the owner judges on
  the real iPhone after the deploy), one radius per role (12 px cards, 10 px controls, pill
  buttons), soft wide shadows
  and the details of single components (glass cards, the tinted navigation entry, the segmented
  control), given as values of `--mat-sys-*` and of component variables through Material's
  `*-overrides` mixins. **Restyle a component there, through its variables** — a selector
  reaching into Material's DOM is the last resort (two exist, in `components`: the blur of a
  card, and the gradient of a filled button) and breaks on an upgrade. Material's own component
  styles are appended **after** this stylesheet, so a rule of equal specificity on one of its
  classes silently loses (`.mat-mdc-card { border }` did) — prefer the variable, or an appearance
  that has one: every card is `appearance="outlined"`, because only the outlined card has an edge
  to colour. When a Material element has to be laid out by a class of ours (centred, sized),
  **wrap it in a plain element and style the wrapper** (the `domain-badge` around its
  `<mat-icon>`); a selector carrying Material's own class (`.mat-icon.message-page__icon`) is
  the fallback for a property of the Material element itself, such as the size of an icon. A
  Material component used for the first time gets its overrides there, in the same task.
  `--mat-sys-corner-full` is deliberately left alone: it keeps round things round.
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
  out (0.4.0). The photo of the view (see "Backgrounds") lies one layer below it, of the same
  shape for the same reason, and halves the glow.
- **A domain card** (a tile about heating, hot water, the boiler room or the household) carries
  `card--domain` plus a class of its own setting `--app-domain` (`.tile--heating
  { --app-domain: var(--app-domain-heating) }`): the colour runs along its top edge and tints it;
  its avatar is a `domain-badge` — a `<div mat-card-avatar>` *wrapping* the `<mat-icon>`, never
  the icon itself (Material's `.mat-icon { display }` beat the badge's `display: flex` in 0.4.0
  and the icon sat in the corner). Both blocks live in `src/styles.scss`. The domain colour
  is for the card and its badge, never for text — text on glass stays `on-surface` /
  `on-surface-variant`. **A status in the season's colour is `on-primary-container`, an error
  is `on-error-container`** (on an `error-container` strip where it is a sentence), and a text
  button's label is `on-primary-container` through the button overrides: the plain `primary`
  and `error` do not reach 4.5:1 on glass over a photo, and the check only knows the container
  shades as text on glass — a component that paints `primary` or `error` text on a card
  (Material's `mat-error`, say) gets an override to the container shade when it is first used.
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

## Backgrounds

Each view can have a real photo of its place behind the glass (HAS-209): the Overview a house
with its garden, later a kitchen, a garage, the boiler room. The photo is the mood of the view;
the text never depends on it.

- **A route names its photo** in `data.background` (`app.routes.ts`), by a name from
  `BACKGROUNDS` (`core/background/backgrounds.ts`); a route without one shows the plain glow.
  `ViewBackground` (`core/layout/`) in the shell reads the name after every navigation and
  renders the `<img>` with both sizes (`srcset`, `sizes="100vw"`) on a layer fixed to the screen
  under the glow — `z-index: -2` in the shell's stacking context, `100lvh` tall for the same
  reason as the glow. A new photo is transparent until its file has arrived (the `load` event —
  a fade keyed to insertion ends before a slow link has delivered the picture), then fades in
  over the old one, which goes when that fade ends; a photo no longer wanted fades out. The glow
  dims to half in step with it (`:has(.view-background__photo--shown)`). With
  `prefers-reduced-motion` there is no fade. `check:contrast` also verifies that every name in
  `BACKGROUNDS` has its two files and its sidecar, and every sidecar a name.
- **The haze** (`view-background.scss`) lays the page colour over the photo — `--app-haze-top`
  / `-bottom` / `-tint` in `_seasons.scss`: 45 → 60 % in the light scheme, 66 → 82 % plus a 10 %
  tint of the primary in the dark one, and the glow is painted at half strength over a photo;
  the glass of the cards is 70 % white / 42 % navy with an 8 px blur, the panel 92 % / 55 % —
  the owner wanted the photo clearly visible and the cards see-through (2026-10-07), and these
  are the thinnest values at which every text pair holds 4.5:1 (the blur is free: the check
  assumes an unblurred patch).
  Those numbers are **what `check:contrast` assumes** (`HAZE_TOP`, `HAZE_TINT`,
  `GLOW_OVER_PHOTO`): it lays the darkest and the lightest patch of every photo under the haze,
  the glow, the glass and the panel, and checks the text on the glass and the panel. **The only
  text on the bare photo is the title of the page** (`.page-header h1`, `on-background`), and it
  lies at the top — so the sidecar also holds the extremes of the **top 25 % of the frame**
  (`top`), which is what the title is checked over; the light haze is 45 % rather than thinner
  because of exactly that pair (dark title over the dusk sky). A view that puts text anywhere
  else than in a card or the title gives it glass, or the check is blind to it; a title lower
  than the top band of the photo is not covered either. The owner chose the thin haze and the
  bare title over the lead sentences and the glass behind the title (2026-10-07), both of which
  were tried and found to waste the room.
- **Adding a photo**: generate the source (Superdesign, `npx --yes @superdesign/cli@latest
  generate-image`; the owner logs in once and confirms the quote), run
  `node scripts/make-background.mjs <source> <name>` — it writes `public/backgrounds/<name>-2560.webp`
  (at most 400 kB), `-1280.webp` and `<name>.json` (the two patches) — add the name to
  `BACKGROUNDS`, name it in the route, and record the prompt and the model in
  `public/backgrounds/README.md`. The files are not hashed, so nginx serves them `no-cache`: a
  regenerated photo under the same name reaches every browser after a revalidation. The sidecar
  and the README stay out of the build (`ignore` of the assets entry in `angular.json`; the
  image test checks it). The two scripts (`make-background.mjs`, `make-icons.mjs`) are run on a
  developer machine only; `sharp`, their one dependency, is a devDependency that CI installs
  and never runs.
- **The switch**: `BackgroundStore` (`core/background/`) — photos on by default, off on the
  Settings page for a device that is slow to blur them, kept in
  `localStorage['smart-home.background']` only while off, synced between tabs like the theme.

## Languages

English is the default — on a first visit always, whatever the language of the browser — and
Polish can be chosen from the toolbar. The choice changes the open page without a reload and is
kept in the browser **per household member**: `localStorage['smart-home.language.<member>']`
for the active profile, `localStorage['smart-home.language']` while there is none — which is
also what a member who never chose falls back to. `LanguageStore` knows the member only as
`LANGUAGE_OWNER`, a signal that `app.config.ts` binds to the profile, so the i18n has no
dependency on the profiles (or on HTTP) and a unit test gets one language for the browser.

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
  browser: the only test of nginx (CSP, SPA fallback, caching, `/healthz`) and of the service
  worker (starting offline, taking an update). Locally:
  `IMAGE_URL=http://localhost:8080 npm run e2e`.
- **Playwright empties its output folder at the start of every run**, and CI runs it twice. So
  the two kinds of run write side by side (`test-results` / `playwright-report` for the mock
  API, `test-results-image` / `playwright-report-image` for the image), and the screenshots go
  to `screenshots/`, which no run empties by itself (`e2e/global-setup.ts` clears it before the
  run that takes them; the image run adds one picture of its own, so it runs second, as in CI).
  A screenshot is always written through `screenshotPath()`
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
