# web-application

---

[![CI](https://github.com/smart-home-automation-system/web-application/actions/workflows/CI.yml/badge.svg)](https://github.com/smart-home-automation-system/web-application/actions/workflows/CI.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=smart-home-automation-system_web-application&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=smart-home-automation-system_web-application)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=smart-home-automation-system_web-application&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=smart-home-automation-system_web-application)

![GitHub Release Date - Published_At](https://img.shields.io/github/release-date/smart-home-automation-system/web-application?style=plastic)
![GitHub Release](https://img.shields.io/github/v/release/smart-home-automation-system/web-application?style=plastic)

---

![GitHub top language](https://img.shields.io/github/languages/top/smart-home-automation-system/web-application?style=plastic)
![Angular](https://img.shields.io/badge/Angular-22-red?style=plastic)
![Node](https://img.shields.io/badge/node-24-green?style=plastic)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=smart-home-automation-system_web-application&metric=coverage)](https://sonarcloud.io/summary/new_code?id=smart-home-automation-system_web-application)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=smart-home-automation-system_web-application&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=smart-home-automation-system_web-application)

![GitHub issues](https://img.shields.io/github/issues/smart-home-automation-system/web-application?style=plastic)
![GitHub pull requests](https://img.shields.io/github/issues-pr-raw/smart-home-automation-system/web-application?style=plastic)

![GitHub last commit](https://img.shields.io/github/last-commit/smart-home-automation-system/web-application?style=plastic)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/smart-home-automation-system/web-application?style=plastic)

---

# Description

The dashboard of the Smart Home Automation System: one web application for the desktop, where
the whole house is managed, and for the phones of the household, where each member sees their
own room. It is an Angular single-page application that talks only to `api-gateway-service`;
it holds no data and no logic of its own beyond presentation.

So far it is the **application shell**: the layout and navigation, the foundation every
dashboard is built on (API client, polling, error handling, house time, two languages, the
profiles of the household), the mock API for development, and the delivery pipeline. The landing
page shows a single read-only tile - the switch of the heating system - which proves the path
from the screen to a backend service. The dashboards themselves arrive with the following tasks.

Everybody in the household has a **profile**, opened by a personal link and remembered in the
browser: the administrator gets the whole application, a resident their own page - see
[Profiles](#profiles), including what a profile is not.

On an iPhone it is **installed on the home screen** and then runs in a window of its own, starts
without the network, says when the house cannot be reached and tells when a newer version is
waiting - see [On the phone](#on-the-phone).

The interface speaks **English and Polish**. English is the default on a first visit, whatever
the language of the browser; Polish is chosen from the toolbar, changes the open page without a
reload and is remembered in the browser - for the household member who chose it, so a screen that
changes hands follows whoever uses it. Dates and numbers follow the language (a 24-hour clock
in both), and so do the labels a screen reader announces.

The look is **"Zorza"** (aurora): a deep page glowing softly in the two colours of the season,
cards of frosted glass over it, and the navigation in a panel on the left. The **colours follow
the season**: green in spring, gold in summer, rust in autumn and blue in winter, each in a light
and a dark variant that follows the setting of the device. The season is taken from the clock of
the browser (it starts on 21 March, 22 June, 23 September and 22 December) and changes by itself
at midnight, also in a dashboard that is never reloaded. Each domain of the house — heating, hot
water, the boiler room, the household — keeps a colour of its own all year, so a card is known by
its colour before it is read. Behind the glass of a view lies a **photo of its place** — the
Overview a house with its garden — under a haze of the page colour, so the photo gives the view
its mood and never competes with the text; a slow device can switch the photos off in the
Settings. The **Settings** page can also show any season and either scheme for preview; the
choices stay in that browser. All eight variants are checked for WCAG AA contrast on every
build, the text over the photos included.

| Layer | Choice |
|---|---|
| Framework | Angular 22 - standalone components, zoneless change detection, signals |
| Components | Angular Material in the "Zorza" look (glass, glow, a colour per domain); colours of the season, light and dark following the system |
| Languages | Transloco, switched at runtime; English in the main bundle, Polish downloaded when chosen |
| Fonts and icons | Plus Jakarta Sans and Material Symbols, **self-hosted** - nothing is loaded from the internet |
| Tests | Vitest (unit), Playwright (browser, desktop and phone layouts) |
| Runtime | static files served by `nginx` (unprivileged image), behind the Kubernetes ingress |

# Profiles

There is no login. A member of the household opens the application with a **personal link**,
`/u/<name>` - the name as it stands in the household registry, in any case - and the browser
remembers them from then on. Without a remembered profile the application shows a **profile
picker** with the active members; each entry is that member's personal link.

| Role | What the interface offers |
|---|---|
| `admin` | Every page. The name in the panel leads to the picker, to look at the application as somebody else; the own link leads back. |
| `resident` | The "My room" page only. Every other address - typed by hand included - leads there, and other profiles are not offered. |

A resident's profile is left only by opening another personal link. Where there is no address
bar to type one into - the application installed on the home screen of a phone - a profile
chosen by mistake is undone by clearing the data of the site (accepted by the owner, 2026-10-07).

The role and the rooms come from the household registry (`database-service`), never from this
application: they are read when a profile is opened, remembered with it, and read again at every
start and whenever the page comes back into view, so a change in the registry takes effect with
the next visit - also under an open page. The application asks for the profiles only - the name,
the role and the rooms of the members who are active - and never downloads the rest of the
registry (phone numbers, devices). A member who is switched off or removed there is not in that
answer and loses the profile; a link that names such a member,
or nobody, ends on a message that says so. While the backend is away the application keeps
working as the member it remembers.

A member's **own link opens at once**, without waiting for the registry: it is the address the
installed application starts from, every time, also where the house cannot be reached. The
registry is asked on the side; a member switched off since then loses the profile when it answers
and is led to the picker (from the install steps: to the message that the link opens nobody).

> **This is not access control.** A profile is a name, and anybody who can reach the application
> can open anybody's link - the administrator's too - or call the API directly: nothing behind
> the gateway is authenticated. The roles keep each member's view simple and keep a resident from
> changing something by accident; they protect nothing from somebody who means to. What protects
> the house is that the application is reachable on the home network and over VPN only. Real
> separation is phase 2: a token in the personal link, validated by the gateway. The code keeps
> one place for it (`src/app/core/profile/`), so no feature changes when it comes.

In the mock API the household is Aurelia (administrator), Borys, Celina and Damian (residents
with one room, two rooms and none): `/u/aurelia`, `/u/borys`.

# On the phone

The household uses iPhones, and the application is a web application all the way: there is
nothing in the App Store. It is put on the home screen from Safari.

**Installing.** Open your personal link (`/u/<name>`) in the browser of the phone. On an iPhone
the page stays and shows the steps: the **Share** button, **Add to Home Screen**, **Add**. The icon then opens the
application in a window of its own, straight in your profile. It has to be added *from the
personal link*: the icon opens the address it was added from (the web app manifest names no start
address on purpose), and the installed application keeps its own storage, apart from Safari's -
on its first start the link is what tells it whose it is. Whoever prefers the browser taps
"Continue in the browser".

**Without a connection.** The application itself is kept on the phone by a service worker, so it
starts anywhere. The house is reachable on the home network and over VPN only; outside, a banner
above the page says that there is no connection, with the time the house last answered, and goes
by itself when it answers again. **No value is ever shown from memory**: the worker keeps the
application and never an answer of the backend - a remembered "heating is on" would be worse than
an error.

**Updates.** A new release is downloaded in the background, next to the running version. Once it
is complete a strip says "A new version of the application is ready" and offers to reload. The
application looks for one whenever it comes back into view and once an hour, because a phone
brings an installed application back as it was and hardly ever loads it anew.

Notifications (Web Push) are not part of this; they come with the appliance notifications.

# Run locally

Node 24 and npm.

```bash
npm ci
npm run start:mock    # no backend needed: every API call is answered from src/mocks
npm start             # against a real gateway: /home is proxied to http://localhost:6200
```

Both serve the application on `http://localhost:4200`. `proxy.conf.json` decides where `/home`
goes for `npm start`; point it elsewhere locally, and never commit a private host or address -
this repository is public.

The mock API can be switched into a failure mode, to look at the error states: in the browser
console set `localStorage['mock-scenario']` to `offline` (no answer at all) or `server-error`
(every call answers 502) and reload; remove the key to go back.

Texts live in `src/app/i18n/` - `en.ts` is the source of the keys and `pl.ts` has to carry the
same ones, which the compiler and a unit test both check.

| Command | What it does |
|---|---|
| `npm run lint` | ESLint over the sources, templates and browser tests |
| `npm test` | Unit tests (Vitest); `npm run test:coverage` writes `coverage/` for Sonar |
| `npm run build` | Production build into `dist/` |
| `npm run check:i18n` | Fails when a template uses a translation key that does not exist |
| `npm run check:bundle` | Fails when the production build contains the mock API, loads anything from another origin, has a manifest with a start address, or a service worker that would keep backend answers |
| `npm run check:contrast` | Fails when a colour of the theme, in any season and scheme, drops below WCAG AA in the production build |
| `npm run e2e` | Browser tests against the mock API, in a desktop and a phone layout; screenshots land in `screenshots/` |

# Backend

Every call goes through `api-gateway-service`, under the base path `/home`. In the cluster the
application and the API share one host: the ingress sends `/home` to the gateway and everything
else to this application, so the browser calls the API on its own origin - no CORS, and no
application page may live under `/home`.

Endpoints used today:

| Method | Path | Used for |
|---|---|---|
| `GET` | `/home/heating` | State of the heating system switch and the time of its last change (overview tile), polled every 30 s |
| `GET` | `/home/household/profiles` | The profiles of the household: the name, role and rooms of every active member, and nothing else (`database-service` 0.10.0 or later). Asked at every start, whenever the page comes back into view, by the profile picker and when a personal link is opened |

What the application relies on, in every call:

- **Errors** come in the shared contract of `cholewa-commons` (`{"errors":[{"message", "code"}]}`).
  The status survives any body - none, HTML from a proxy, JSON of another shape - and what a
  failing service (5xx) says about itself is never shown on screen. The message of a refused
  request (4xx) is shown exactly as sent - in English, also when the interface is Polish, and
  never run through the translations.
- **Date-times** are `LocalDateTime` values: the wall-clock time of the house, without an offset.
  They are displayed exactly as sent and never converted to the zone of the browser, so a phone
  abroad on VPN still shows house time.
- **Timeouts**: a call that gets no answer within 10 s is aborted and reported as a connection
  failure, so a backend that accepts a request and never answers cannot leave a view loading
  forever.
- **No answer is kept**: every call carries the header `ngsw-bypass`, which sends it past the
  service worker untouched. The gateway ignores the header.
- **Out of reach**: two calls in a row without any answer raise the banner "No connection to
  the house" - one is not enough, because a single service that hangs looks the same while the
  house is fine; after the first, the profiles are asked for at once, which settles it. Any
  answer, a failing service included, takes the banner away - what failed is then told by the
  view that asked. While the banner is up the profiles are asked for every 30 s.
- **Polling** stops while the browser tab is hidden and resumes at once when it is back; every
  view shows how old its data is and marks it once it can no longer be trusted.

# Container image

`release.yml` builds the image on every GitHub release and pushes it to Docker Hub as
`magikabdul/web-application:<tag>` (and `latest`). A manual run takes an existing tag and
rebuilds exactly that tag. The application is built inside the image;
the release tag and the commit are stamped into it and shown on the **About** page.

| | |
|---|---|
| Port | `8080` (the image runs as a non-root user and needs only `/tmp` writable) |
| Health | `GET /healthz` - used by the Kubernetes probes |
| Deep links | any path without a file falls back to `index.html`, so `/about` can be opened or reloaded directly |
| Caching | files the build names with a content hash are immutable; everything else is revalidated on every load - `index.html`, and the service worker with its list of files (`ngsw-worker.js`, `ngsw.json`), which is how a new release reaches a browser that keeps the application |
| Manifest | `/manifest.webmanifest`, served as `application/manifest+json` |
| Security headers | a `Content-Security-Policy` allowing this origin only, plus `nosniff`, `frame-ancestors 'none'` and a no-referrer policy |
| Logs | one JSON object per request on stdout |

The image is tested in CI before it can be released: it is built, started with a read-only
root filesystem, and opened in a real browser, which checks that the application runs under
its Content-Security-Policy, that it starts again with the network cut off, and that it notices
a version deployed since. The service worker exists in a production build only - the dev server
and the mock API run without one - so this is the one place it is tested.

```bash
docker build --build-arg APP_VERSION=0.0.0-local -t web-application:local .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 web-application:local
IMAGE_URL=http://localhost:8080 npm run e2e      # the same smoke test CI runs
```

The Kubernetes manifest (Service, Deployment, Ingress) lives in the private `deployment-tools`
repository, next to those of the services.
