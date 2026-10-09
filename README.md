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

It has the **application shell** - the layout and navigation, the foundation every dashboard is
built on (API client, polling, error handling, house time, two languages, the profiles of the
household), the mock API for development, and the delivery pipeline - and the first four
dashboards:

- **Heating**: the switch of the whole heating system, whether any room is being heated right
  now, the pump of the floor heating, **the rooms of the house** floor by floor - the
  temperature of each with the age of its reading, the temperature its schedule asks for right
  now, and its heaters with what their relays last reported; a room opens into the week of its
  heaters, read-only - and the temperature sensors: when each room last reported, which sensor
  has fallen silent and which is left out of the alerts. The switch is the one control of the application
  that changes the house: it asks before it acts, and what it shows afterwards is what the
  house answers when asked again, never what was clicked.
- **Hot water**: the temperature of the water in the tank on a gauge with the band it is kept in
  (heated once it drops below 38 °C, until it is above 42 °C), the temperature of the
  circulation, and whether the water asks to be heated.
- **Boiler room**: a schematic of the furnace and the two pumps it feeds, with the state of
  every device, the last thing `boiler-service` noted about it and how long ago that was.

- **Presence**: who of the household is at home now, since when, and how long ago the
  detection last checked; the days of one resident as bars from 00:00 to 24:00 with the time at
  home, the first arrival and the last departure; and the days of the house with the stretches
  it stood empty - for today, 7 or 30 days, or two dates within the last 366 days. Only what
  was observed is drawn: time nobody looked at is hatched and named as such, never shown as
  absence.
- **My room**: the page of a household member, made for the phone and a resident's whole
  application. It shows the rooms the registry gives the profile, one at a time - a member with
  several chooses among them, a member with none is told so. Per room: the temperature with
  the age of its reading, the humidity when the heating service reports one, the temperature
  the schedule asks for right now, each heater with what its relay last reported, and the
  schedule of today. All of it is read-only; setting a temperature or a schedule is not part of
  this application for anybody yet, and will be the administrator's alone. The page has no
  control - except for a member the household registry grants the permission
  `heating_switch`: that member also gets the switch of the heating of the whole house here,
  the same card as on the heating dashboard.

Hot water, the boiler room and the presence are read-only. The landing page still shows a single tile - the
state of the heating system; the overview proper arrives with a following task.

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

On a phone the navigation is a bar at the bottom with five places. With more destinations than
that - the administrator has six - it shows the first four and **More**, which lists the rest.

| Role | What the interface offers |
|---|---|
| `admin` | Every page. The name in the panel leads to the picker, to look at the application as somebody else; the own link leads back. |
| `resident` | The "My room" page only - their rooms, read-only. Every other address - typed by hand included - leads there, and other profiles are not offered. |

Next to the role the registry can grant a member a **permission** - one thing beyond what the
role gives. There is one so far, `heating_switch`: the switch of the heating of the whole house
on the member's own "My room" page (`PUT /home/household/member/{name}/permissions` of
`database-service` grants and withdraws it). Without it the page has no switch, for a resident
and for the administrator alike - the administrator switches the heating on its dashboard. A
permission, like a role, decides what is offered and is no access control.

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

The mock API can be switched into another mode, to look at the states that are hard to come by:
in the browser console set `localStorage['mock-scenario']` to `offline` (no answer at all),
`server-error` (every call answers 502), `no-readings` (the services answer as they do just
after a start, before anything was measured) or `writes-fail` (reads answer as usual, every
change answers 500 - a heating switch the house did not carry out) and reload; remove the key
to go back. The mock household lives by a routine worked out from the clock, with a history
of twelve days and one member the detection has never seen. The heating of the mock house can
be switched: it lives in the memory of the page,
and a reload is the house as it started. **`npm start` talks to the real gateway - the switch
pressed there switches the real heating.**

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
| `GET` | `/home/heating` | State of the heating system switch and the time of its last change (overview tile, heating, and my room for a member with `heating_switch`), polled every 30 s, and once more right after every change of the switch |
| `POST` | `/home/heating?turn=on\|off` | Switches the heating of the whole house (heating, and my room for a member with `heating_switch`), after a confirmation. Its answer is not used: the state is read again |
| `GET` | `/home/heating/status/active` | Whether any room is being heated right now - the system is on *and* a room asks for heat (heating), polled every 30 s and right after a change of the switch |
| `GET` | `/home/heating/rooms` | Every room with its temperature, heaters and schedules (heating), polled every 30 s. Needs `heating-service` 1.8.0 or later |
| `GET` | `/home/heating/rooms/{name}` | One room, by the identifier the registry gives a profile (my room), polled every 30 s for the room on screen. A 404 with the code `NOT_FOUND_ROOM` is shown as "the heating service does not know this room" |
| `GET` | `/home/heating/floor-pump` | What the relay of the floor heating pump last reported (heating), polled every 30 s |
| `GET` | `/home/heating/temperature/sensors` | Per room the time of the last reading, `stale` and `muted` (heating), polled every 60 s. A room that never reported is not in the answer |
| `GET` | `/home/presence/residents/presence` | Who is at home now: per active member `present`, `since` and `lastCheckedAt` (presence), polled every 60 s. A member nothing is stored about comes as not present with no times - shown as "not observed yet", not as away |
| `GET` | `/home/presence/residents/{name}/report?from=&to=` | The periods at home of one resident (presence). Asked when the resident or the period changes, then every 5 min |
| `GET` | `/home/presence/residents/{name}/report/daily?from=&to=` | The days of that resident: time at home, first arrival, last departure, share (presence). Always asked together with the report above |
| `GET` | `/home/presence/house/report?from=&to=` | The house as a timeline of occupied and empty stretches, and its days (presence). Asked when the period changes, then every 5 min |
| `GET` | `/home/water/status/temperature` | The last reading of the tank and the circulation (hot water), polled every 30 s. The service answers 200 with **no body** until its first reading - shown as "no temperature has been measured yet" |
| `GET` | `/home/water/status/active` | Whether the water asks to be heated (hot water), polled every 30 s |
| `GET` | `/home/boiler/status` | The furnace and both pumps: `working` and the last note of the service with its time (boiler room), polled every 30 s |
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
- **How long ago** a date-time was is worked out in the time zone of the house
  (`Europe/Warsaw`, in the configuration of the application): the value carries no offset, and
  the age has to be the same on a phone abroad.
- **Missing is not "off"**: a field the answer does not carry is shown as unknown - "no status
  yet", "nothing measured yet" - never as a device that stands or water that is warm enough.
- **Two things the hot water cannot know from the API**: the band of 38 / 42 °C is a copy of two
  constants of `water-service`, which no endpoint exposes; and the temperatures carry no time of
  measurement, so the page shows when it last *asked*, and a sensor that fell silent keeps
  reading as current.
- **Timeouts**: a call that gets no answer within 10 s is aborted and reported as a connection
  failure, so a backend that accepts a request and never answers cannot leave a view loading
  forever.
- **A change is never assumed to have worked - or to have failed**: after `POST /home/heating`
  the state is read again, whatever the change answered, and the page shows that. A change
  that got no answer is told as "may not have been carried out", and the notice goes once the
  house is in the state that was asked for.
- **The range of a report** is two local date-times of the house, from a midnight to the
  midnight after the last day, at most 366 days; the running day is included, and the reports
  end by themselves at the last check (`observedUntil`). The name of a resident is
  percent-encoded into the path. `GET /home/presence/clients` is never called.
- **Only the observed part of a report is drawn**: a day outside `observedFrom` ..
  `observedUntil` gets no row, the part of a day outside it is hatched, and the page says where
  the history begins. Time the detection was down *in the middle* of the history reads as empty
  in the answer of the service itself - the page says so under the list of the house.
- **What the rooms show is what `heating-service` says, and nothing it leaves out is guessed.**
  The service omits whatever it has not measured, heard from a relay or decided yet: such a
  heater reads "no status yet", such a room "No reading yet" - never "off" or a zero. Right
  after a deploy of `heating-service` most rooms therefore show a temperature and heaters
  without a status, until their sensors report again. The **target** is the service's
  `scheduledTemperature` (for a room with two heaters the higher one); the page works nothing
  out from the schedules with the clock of the browser. **"Calls for heat"** is the service's
  `inSchedule`: a period is on *and* the room is colder than it asks - with the heating
  switched off a heater can call for heat and stay off. The week of a heater is placed by the
  clock of the house, also on a phone abroad. A period the page cannot draw - an unknown day, a
  cooling period - is counted under the week, not dropped in silence.
- **Which room is on which floor is a list in this application** (`FLOORS`,
  `features/heating/floors.ts`), by the room identifiers of `smart-home-sdk`; the service
  knows no floors. A room the list does not name is shown all the same, under "Other".
- **The rooms of a member are the registry's, the data of a room the heating service's.** "My
  room" asks `heating-service` for each room by the identifier `database-service` gives the
  profile. Nothing makes the two agree: a room the heating service does not have is told as
  that, in words, not as a failure - and a room it has but knows little about (one whose
  radiator is switched elsewhere, say) shows exactly that little: no reading, a heater without
  a status, no schedule.
- **Two things the heating page cannot know from the API**: after how long a sensor counts as
  silent (a setting of `heating-service`, a day unless changed - the page does not name the
  number), and *which* rooms are being heated - the answer is one flag for the whole house.
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
