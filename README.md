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

This release is the **application shell**: the layout and navigation, the foundation every
dashboard is built on (API client, polling, error handling, house time), the mock API for
development, and the delivery pipeline. The landing page shows a single read-only tile - the
switch of the heating system - which proves the path from the screen to a backend service. The
dashboards themselves arrive with the following tasks.

| Layer | Choice |
|---|---|
| Framework | Angular 22 - standalone components, zoneless change detection, signals |
| Components | Angular Material (Material Design 3), light and dark following the system |
| Fonts and icons | Roboto and Material Symbols, **self-hosted** - nothing is loaded from the internet |
| Tests | Vitest (unit), Playwright (browser, desktop and phone layouts) |
| Runtime | static files served by `nginx` (unprivileged image), behind the Kubernetes ingress |

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

| Command | What it does |
|---|---|
| `npm run lint` | ESLint over the sources, templates and browser tests |
| `npm test` | Unit tests (Vitest); `npm run test:coverage` writes `coverage/` for Sonar |
| `npm run build` | Production build into `dist/` |
| `npm run check:bundle` | Fails when the production build contains the mock API or loads anything from another origin |
| `npm run e2e` | Browser tests against the mock API, in a desktop and a phone layout; screenshots land in `test-results/screenshots/` |

# Backend

Every call goes through `api-gateway-service`, under the base path `/home`. In the cluster the
application and the API share one host: the ingress sends `/home` to the gateway and everything
else to this application, so the browser calls the API on its own origin - no CORS, and no
application page may live under `/home`.

Endpoints used today:

| Method | Path | Used for |
|---|---|---|
| `GET` | `/home/heating` | State of the heating system switch and the time of its last change (overview tile), polled every 30 s |

What the application relies on, in every call:

- **Errors** come in the shared contract of `cholewa-commons` (`{"errors":[{"message", "code"}]}`).
  The status survives any body - none, HTML from a proxy, JSON of another shape - and what a
  failing service (5xx) says about itself is never shown on screen.
- **Date-times** are `LocalDateTime` values: the wall-clock time of the house, without an offset.
  They are displayed exactly as sent and never converted to the zone of the browser, so a phone
  abroad on VPN still shows house time.
- **Timeouts**: a call that gets no answer within 10 s is aborted and reported as a connection
  failure, so a backend that accepts a request and never answers cannot leave a view loading
  forever.
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
| Caching | files the build names with a content hash are immutable; `index.html` is revalidated on every load, which is how a new release reaches an open browser |
| Security headers | a `Content-Security-Policy` allowing this origin only, plus `nosniff`, `frame-ancestors 'none'` and a no-referrer policy |
| Logs | one JSON object per request on stdout |

The image is tested in CI before it can be released: it is built, started with a read-only
root filesystem, and opened in a real browser, which checks that the application runs under
its Content-Security-Policy.

```bash
docker build --build-arg APP_VERSION=0.0.0-local -t web-application:local .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 web-application:local
IMAGE_URL=http://localhost:8080 npm run e2e      # the same smoke test CI runs
```

The Kubernetes manifest (Service, Deployment, Ingress) lives in the private `deployment-tools`
repository, next to those of the services.
