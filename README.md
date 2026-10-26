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
household), the mock API for development, and the delivery pipeline - the overview and the
dashboards:

- **Overview**: the house at a glance, the landing page of the administrator - a tile per
  dashboard. **Heating** (HAS-266): whether the system is on and since when, how many rooms there
  are and how many are being heated, the coldest and the warmest room with the age of each reading,
  and a **red blinking light** by its title while a temperature sensor is silent; the switch itself
  is on the heating page only. Then the hot water, the boiler room, who is at home - with a warning
  when the detection has not checked for more than five minutes - the weather (temperature, dew
  point, wind and gusts, rain, daylight), the blinds (HAS-254: how many are open, closed, moving
  and not known, read once a minute) and the lights (HAS-268: how many are on, off and not known,
  the rooms with a light on, and whether the house is empty and acted on) and the appliances
  (HAS-282: which of the washing machine, the dryer and the dishwasher runs and which waits to be
  emptied - nothing to press there). Every call has its own freshness and its own failure, so the
  page stays whole while one service is down; the title of a tile leads to the dashboard that has
  the rest.
- **The weather strip**: in the panel of every page, for every member and on the profile picker:
  the outdoor temperature and humidity, led by an icon of rain or of a strong wind (8 m/s), with
  the age of the reading. A failed call keeps the last reading, its age marked, with the reason
  in a tooltip (a tap on a phone); with nothing to show - no answer yet, or a station not heard
  yet - it shrinks to an icon whose tooltip says why.
- **Weather**: the weather station in detail - temperature with dew point and humidity, wind
  with gusts and its direction on a dial, rain now and the rain gauge, pressure, daylight and UV,
  and the station itself (whether its gateway answers, when it was last heard, battery and
  voltage) - and six charts of the history over 24 hours, 7 or 30 days, one period for all:
  temperature and dew point, humidity, wind and gusts, daylight (logarithmic), rain per interval,
  pressure.
- **Rooms** (HAS-232): every room of the house floor by floor, a card per room with one line for
  each kind of thing in it - temperature, heating, lights (a bulb each), blinds (a position each,
  the door first), motion, presence sensors, openings (windows and doors), the rest - and a window
  with its devices: the **lights** (HAS-292: every light, Eaton and Shelly, switched on or off
  and a dimmer set through `light-service`, with its real state - on, off or not known yet, the
  brightness, unreachable, and until when the rules of the room leave it alone after a change by
  hand) and the **blinds** (open, stop, close, a position, and the pause of their schedules until
  their next run). The heating of a room is shown there and set on the heating page only. Nothing asks before a command; nothing is
  shown before the services say so - a blind or a light is read again after every command.
- **Blinds** (HAS-252): at the top the **holidays** of the next 60 days (weekdays only - what the
  schedules count as days off besides the weekends; read only) and **the whole house** - open,
  stop or close every blind, the rooms one after the other. Under them the floors, a card of one
  size for every room that has blinds: a line per blind (its position, open / stop / close, a
  position from a menu for a blind that can go to one, an icon for a blind whose schedules are
  paused or that does not answer), one line for what the last command came to, and the commands
  of the room. The **schedules** of a room open in a window from its card - the pause of each
  blind of the room, then every schedule that moves one of them: the rule, today's window, the
  conditions with their values now, what came of each blind today, and the switch of the
  schedule, and a link to change it. The protection against wind and frost comes with HAS-249.
- **Schedule editor** (HAS-253): `/blinds/schedules/new` - from "New schedule" on the blinds page,
  or "New schedule for this room" in the window of a room, which starts with that room - and
  `/blinds/schedules/{id}`. Name, on / off, the days (workdays, days off, every day), the window
  from / to - each a clock time, or the sunrise / sunset moved by minutes and held between an
  optional earliest and latest - the rooms or single blinds it moves, the conditions (illuminance,
  outside temperature, wind gust below / above a threshold, raining, window closed; each held for
  minutes) and what it does (open, close, or a position). Every rule of `blinds-service` is
  checked before saving - a threshold that can never be crossed too (`below 0 lx`; the hint shows
  what the operator chosen can meet, `1 … 200 000 lx` below); a save is read back from the service, a failed one keeps the form; the
  line of today is what the engine makes of the saved schedule. Removing asks first.
- **Lights** (HAS-266, the administrator's): every light of `light-service`. At the top **the
  whole house** (lights on, off and not known, the rooms a presence sensor says somebody is in) and
  **the empty house** (whether anybody is at home, whether the service acts on it, tonight's dusk
  and sunrise, the phase of the presence simulation and what it lights). Under them, floor by floor,
  a card of one size per room with lights: the occupancy of the room (occupied, empty or not known,
  the last motion, lux), a line per light with its state and on / off, what the last command came
  to, the rule of the room in a few words and **All off**. "Details" opens a window for the room:
  per light when it changed and by whom and its manual hold, the brightness of a dimmer, red /
  green / blue (and white) of an rgbw light, the sensors of the room, the rule as stored and what
  the rules engine sent in the last 24 hours. A resident stops the rules of their own room on My
  room (HAS-268).
- **The rule of a room** (HAS-267, the administrator's, `/lights/rooms/{room}/rules`, from "Change
  the rule" / "Write a rule" in the window of a room): what the rule can rely on - the lights of the
  room (switching, dimming, colour) and its presence and motion sensors as the device registry has
  them - then **auto-off** (off so many minutes after the room is empty), **motion-on** (on at a
  motion, only below a lux, off again after the last motion, with the periods of the day: from, to,
  a brightness, and for an rgbw light a colour and a white), **the manual hold** and the switch of
  the resident. Every rule of `light-service` is checked before anything is sent - overlapping
  periods, motion-on without a period, what the room cannot do; **a room on Eaton PIRs only gets no
  rule** (its lights stay with NetLinx). A save writes the rule whole and shows what the service
  stored; removing asks first. Under the form, what the rules did in the room in the last 24 hours.
- **Heating**: a row of four cards of one size (HAS-266) - the switch of the whole heating
  system, whether any room is being heated right now, the pump of the floor heating and the
  **temperature sensors**: how many report, with a red blinking light while one is silent, and
  their list in a window ("Details": when each room last reported, which sensor has fallen silent
  and which is left out of the alerts). Under them **the rooms of the house**, a tile of one size
  per room, floor by floor as on the devices page: the temperature with the age of its reading,
  the temperature its schedule asks for right now, each heater with what its relay last reported
  (a flame where it calls for heat), and the windows of the room with the hold of its heating.
  "Schedule" on a tile opens a window with the week of each heater and **the history of the
  temperature of the room** - the last 24 hours, 7 or 30 days, with the schedule the room has
  today as a dashed line. The schedules are read-only: `heating-service` has no way to change
  one yet. The switch is the one control of the page that changes the house: it asks before it
  acts, and what it shows afterwards is what the house answers when asked again, never what was
  clicked.
- **Hot water**: the temperature of the water in the tank on a gauge with the band it is kept in
  (heated once it drops below 38 °C, until it is above 42 °C), the temperature of the
  circulation, **when the sensors were read** - a reading older than 6 minutes is marked out of
  date, because the service repeats its last one while the sensor is silent - whether the water
  asks to be heated, and **the history of both temperatures** over the last 24 hours, 7 or 30
  days, on the band the tank is kept in.
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
  the schedule asks for right now, each heater with what its relay last reported, the schedule
  of today, and the windows of the room with the hold of its heating. Since HAS-254 also **the
  blinds of the room** - each with its position, open / stop / close, a position for one that can
  go to one, and the pause of its schedules until their next run (no card for a room without
  blinds; the schedules themselves stay the administrator's) - and **the motion and presence
  sensors** the registry places in the room, their state not known yet. Since HAS-268 also **the
  lights of the room**: the occupancy of the room, each light with on / off, the brightness of a
  dimmer and the colour of an rgbw light, "All off", and the rule of the room in a few words with
  **the switch of the resident**, which stops the automatic lighting of the room until it is
  switched on again (no card for a room without lights; the rules themselves stay the
  administrator's). The heating is read-only; setting a temperature or a schedule is not part of
  this application for anybody yet, and will be the administrator's alone. The blinds and the
  lights are the only controls of a room - and for a member the household registry grants the permission
  `heating_switch`: that member also gets the switch of the heating of the whole house here,
  the same card as on the heating dashboard. Under the rooms, for every member, **the appliances
  of the household** (HAS-282): the washing machine, the dryer and the dishwasher with their state,
  running since or finished at, and "Emptied" for one that has finished and waits - the reminders
  of `appliance-service` stop with it. Not by room: the appliances are the household's.
- **The appliance notice**: above every page, for every member with a profile, a strip for each
  appliance that has finished and waits to be emptied, with since when, "Emptied" and a close
  button that hides it for the visit - it comes back with the next finished cycle. Nothing is
  said while the call fails. (Once the NFC tags of HAS-343 claim a run, the acknowledgement of a
  member is the tag and the button becomes the administrator's.)
- **Notifications on this device** (HAS-284): on My room for every member, and on the settings, a
  card with one switch - when an appliance has finished, the phone tells its member while they are
  at home, also with the application closed (Web Push of `notification-service` 0.6.0). The switch
  asks the browser for the permission, subscribes it with the public key of the house and stores the
  subscription for the member; switched off, the browser's subscription ends and the registry forgets
  it. It is checked again at every start: a subscription the browser lost is made anew while the
  permission stands. The card tells every other state in words - a tab of Safari on an iPhone is led
  to the personal link (the application has to be on the home screen first, and added from that
  link), a browser without push, blocked notifications, a house without a key. A tap on a
  notification opens the page it names (My room); a push that arrives while the application is open
  also refreshes the appliance notice at once.
- **Household**: the administration of the household registry, the administrator's. Everybody
  the registry holds, switched off or not, with their phone, role, rooms, permissions and
  devices - and the forms to add a member (from the button by the title, in a window of its own -
  HAS-266), change one, switch one off and on, remove one, and
  to add, change and remove the devices the presence detection looks for. Each active member
  has their **personal link** there, with a **QR code** to scan with the phone. What the
  registry would refuse is said before anything is sent (a name of 3 to 50 characters, a phone
  number in the international format, a MAC address, and that a name, a phone number and a MAC
  address belong to one member); removing a member or a device asks first. Nothing is shown as
  done before the registry says so: a change is sent, the registry is read again, and the page
  shows that answer. The member using the page cannot rename, demote, switch off or remove
  themselves there - the browser would lose its own profile.
- **Devices**: the administration of the device registry, the administrator's. Every room of the
  house as a card of one size - a row of cards per floor - counting its devices by kind (blinds 2,
  light 1, presence sensor none, ...); "Details" and "Add" open the window of the room, one size
  for every room, with every device of it - blinds, lights, sensors, whatever their vendor - each
  with what it is and how it is reached: the address, channel and
  MQTT id of a Shelly, the gateway and point of an Eaton device, the address of a Bluetooth
  sensor. And the forms to register a device, change one, switch one off and on for the
  services, and remove one. Blinds are given **the sensors of their own window** (HAS-290), picked
  from the opening sensors of the registry - none means a window that counts as closed; a sensor
  that blinds still name is not offered for removal. **The kind decides what the form asks for**: the ways such a device
  can be reached, and the fields of that kind alone; the kind of a registered device cannot be
  changed. What the registry would refuse is said before anything is sent - a name of 3 to 50
  characters, an address, the id a Shelly of generation 2 or later reports under, a point from
  1 to 99, and that a channel of a Shelly, a point of a gateway and a Bluetooth address belong
  to one device. Removing a device asks first, and for an Eaton device says what the house
  loses with it: the AMX system asks for that point with every datagram, and for a room sensor
  the temperature of the room in the heating ends there. Nothing is shown as done before the
  registry says so, and one change is made at a time.

Hot water, the boiler room and the presence are read-only.

Every view stands in the **middle of the page**, with its title in the top left corner, and the
cards of a row are of one size (HAS-266).

**The charts** are drawn with ECharts, downloaded by the first view that shows one and never
with the first page. A history is asked for with its two ends only - the services choose how
the range is cut into buckets - and **a bucket without a reading is a break in the line**, never
a slope drawn across it. The dashed line of a room is the schedule the room has *today*: what
was in force on a past day is stored nowhere, and the chart says so.

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
water, the boiler room, the household, the devices, the blinds, the lights, the appliances — keeps a colour of its own all year, so a card is known by
its colour before it is read. Behind the glass of every page lies a **photo of its place** — the
Overview a house with its garden, the heating a living room in winter — under a haze of the page colour, so the photo gives the view
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
that - the administrator has fourteen - it shows the first four and **More**, which lists the rest.

| Role | What the interface offers |
|---|---|
| `admin` | Every page. The name in the panel leads to the picker, to look at the application as somebody else; the own link leads back. |
| `resident` | The "My room" page only - their rooms, read-only but for their blinds (HAS-254). Every other address - typed by hand included - leads there, and other profiles are not offered. |

Next to the role the registry can grant a member a **permission** - one thing beyond what the
role gives. There is one so far, `heating_switch`: the switch of the heating of the whole house
on the member's own "My room" page. The administrator grants and withdraws it on the Household
page (`PUT /home/household/member/{name}/permissions` of `database-service`). Without it the page has no switch, for a resident
and for the administrator alike - the administrator switches the heating on its dashboard. A
permission, like a role, decides what is offered and is no access control.

A resident's profile is left only by opening another personal link. Where there is no address
bar to type one into - the application installed on the home screen of a phone - a profile
chosen by mistake is undone by clearing the data of the site (accepted by the owner, 2026-10-07).

The role and the rooms come from the household registry (`database-service`), never from this
application: they are read when a profile is opened, remembered with it, and read again at every
start and whenever the page comes back into view, so a change in the registry takes effect with
the next visit - also under an open page. The application asks for the profiles only - the name,
the role and the rooms of the members who are active - and does not download the rest of the
registry (phone numbers, devices); the one exception is the Household page of the
administrator, which is the administration of exactly that. A member who is switched off or removed there is not in that
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
with one room, two rooms and none): `/u/aurelia`, `/u/borys` - and Emil, who is switched off
and so has no profile. The Household page changes that household in the memory of the page; a
reload is the household as it started.

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
| `GET` | `/home/heating/rooms` | Every room with its temperature, heaters and schedules (heating, overview, rooms), polled every 30 s. Needs `heating-service` 1.8.0 or later; its `window` (the windows of the room and the hold of its heating) from 1.10.0 |
| `GET` | `/home/heating/rooms/{name}` | One room, by the identifier the registry gives a profile (my room), polled every 30 s for the room on screen. A 404 with the code `NOT_FOUND_ROOM` is shown as "the heating service does not know this room" |
| `GET` | `/home/heating/rooms/{name}/temperature/history?from=&to=` | The stored temperatures of a room, averaged into buckets (heating, the open room). Asked when the room is opened or the period changes, then every 5 min. Needs `heating-service` 1.9.0 or later |
| `GET` | `/home/heating/floor-pump` | What the relay of the floor heating pump last reported (heating), polled every 30 s |
| `GET` | `/home/heating/temperature/sensors` | Per room the time of the last reading, `stale` and `muted` (heating, overview), polled every 60 s. A room that never reported is not in the answer |
| `GET` | `/home/presence/residents/presence` | Who is at home now: per active member `present`, `since` and `lastCheckedAt` (presence, overview), polled every 60 s. A member nothing is stored about comes as not present with no times - shown as "not observed yet", not as away |
| `GET` | `/home/presence/residents/{name}/report?from=&to=` | The periods at home of one resident (presence). Asked when the resident or the period changes, then every 5 min |
| `GET` | `/home/presence/residents/{name}/report/daily?from=&to=` | The days of that resident: time at home, first arrival, last departure, share (presence). Always asked together with the report above |
| `GET` | `/home/presence/house/report?from=&to=` | The house as a timeline of occupied and empty stretches, and its days (presence). Asked when the period changes, then every 5 min |
| `GET` | `/home/water/status/temperature` | The last reading of the tank and the circulation with `measuredAt`, the time the sensors were read (hot water, overview), polled every 30 s. Without `measuredAt` - a `water-service` below 0.6.0 - the age of the reading is not shown. The service answers 200 with **no body** until its first reading - shown as "no temperature has been measured yet" |
| `GET` | `/home/water/temperature/history?from=&to=` | Both temperatures over a range, averaged into buckets (hot water). Asked when the period changes, then every 3 min. Needs `water-service` 0.6.0 or later |
| `GET` | `/home/water/status/active` | Whether the water asks to be heated (hot water), polled every 30 s |
| `GET` | `/home/boiler/status` | The furnace and both pumps: `working` and the last note of the service with its time (boiler room, overview), polled every 30 s |
| `GET` | `/home/weather/current` | Every metric of the weather station with `value`, `measuredAt` and `stale` (the strip on every page, overview, weather), polled every 60 s by one resource for all. A metric never heard is not in the answer and is not drawn; `{}` is a station not heard yet. Needs `weather-service` 0.4.0 and `api-gateway-service` 0.6.0 or later |
| `GET` | `/home/weather/status` | How the service hears the station: its gateway (answers or not, when checked), when the station was last heard, `silent` after 30 min (weather), polled every 60 s |
| `GET` | `/home/weather/history?metric=&from=&to=` | One metric over a range, averaged into buckets with `min` / `max` (weather: temperature, dew point, humidity, wind, gust, illuminance, precipitation, pressure). Asked when the period changes, then every 3 min. An unknown metric is `UNKNOWN_METRIC` |
| `GET` | `/home/household/profiles` | The profiles of the household: the name, role, rooms and permissions of every active member, and nothing else (`database-service` 0.10.0 or later; the permissions from 0.11.0 - an older one sends none, and nobody then has the switch on "My room"). Asked at every start, whenever the page comes back into view, by the profile picker and when a personal link is opened - and after every change made on the Household page |
| `GET` | `/home/household` | The whole registry - every member, switched off or not, with phone, role, rooms, permissions and devices (household). By the Household page only, polled every 60 s while it is open and read again after every change |
| `POST` | `/home/household/member` | Adds a member, with role, rooms and permissions (household) |
| `PATCH` | `/home/household/member/{name}` | Changes the name, the phone and the role of a member (household). Sent only when one of them changed |
| `PUT` | `/home/household/member/{name}/rooms` | Replaces the rooms of a member, in display order (household). Sent only when the list changed |
| `PUT` | `/home/household/member/{name}/permissions` | Replaces the permissions of a member (household). Sent only when the list changed; needs `database-service` 0.11.0 or later |
| `POST` | `/home/household/member/{name}/activate`, `.../deactivate` | Switches a member on or off (household) |
| `DELETE` | `/home/household/member/{name}` | Removes a member with their devices (household), after a confirmation |
| `POST` | `/home/household/member/{name}/device` | Adds a device to a member (household) |
| `PATCH` | `/home/household/member/{name}/device?mac=` | Changes the device a member has under that MAC address (household) |
| `DELETE` | `/home/household/member/{name}/device?mac=` | Removes that device (household), after a confirmation |
| `GET` | `/home/blinds` | Every blind by room with its state, position, window and `schedulePausedSince` (rooms, blinds), polled every 10 s and right after every command; once a minute by the tile of the overview. Needs `blinds-service` 0.8.0 for the pause |
| `GET` | `/home/blinds/rooms/{room}` | The blinds of one room (my room), polled every 10 s and right after every command; an empty list for a room without blinds - then no card |
| `GET` | `/home/device/registry?room={room}&enabled=true` | The switched-on devices of one room (my room: its motion and presence sensors), every 60 s - the one read of the device registry outside the administration; only names and kinds are shown |
| `POST` | `/home/blinds/{id}?command=open\|close\|stop&source=dashboard`, `/home/blinds/{id}/position?value=` | Moves a blind (rooms). No question first; its answer is not used: the blinds are read again |
| `PUT` / `DELETE` | `/home/blinds/{id}/schedule-pause` | Pauses the schedules of a blind until their next run, or ends the pause (rooms, blinds) |
| `POST` | `/home/blinds/rooms/{room}?command=open|close|stop&source=dashboard` | Moves every blind of a room (blinds); the whole house is every room with blinds, one after the other. The blinds it skipped are told |
| `GET` | `/home/blinds/schedules`, `/home/blinds/schedules/{id}/today` | The schedules of the blinds and what the engine makes of each today (blinds), the list and then each day one after the other, every 60 s |
| `POST` | `/home/blinds/schedules/{id}/enable`, `/disable` | Switches a schedule on or off (blinds); the schedules are read again |
| `GET` | `/home/calendar/days?from=&to=` | The days of the next 60 days of the house (blinds: the holidays on weekdays), every 15 min. Needs `database-service` 0.14.0 or later |
| `GET` | `/home/light` | Every light by room with its state, brightness, reachability and `heldUntil` (rooms), polled every 10 s and right after every command. Needs `light-service` 0.6.0 and `api-gateway-service` 0.8.0 or later |
| `POST` | `/home/light/{id}?turn=on\|off&source=dashboard`, `/home/light/{id}/brightness?value=1..100&source=dashboard` | Switches a light by its registry id, sets the brightness of a dimmer or an rgbw light (rooms). The rules engine holds a light changed from here; the lights are read again |
| `GET` | `/home/light/rooms/{room}/rules` | The rule of a room (my room: every 60 s; the editor of the rule: once, and again after a save); `404 NOT_FOUND_RULE` is a room without one. Needs `light-service` 0.6.0 or later |
| `PUT` / `DELETE` | `/home/light/rooms/{room}/rules` | Writes the rule of a room whole, or removes it (the editor of the rule, HAS-267); the rule is read again, the answer of the write is not used. `INVALID_RULE` names what the service refused only in `details`, which is never shown - the editor checks every rule of the service first |
| `PUT` | `/home/light/rooms/{room}/rules/resident-enabled` | The switch of the resident (my room, the editor of the rule); the rule is read again |
| `GET` | `/home/light/rooms/{room}/rules/runs?from=&to=` | What the rules engine sent in a room in the last 24 hours (the window of a room, the editor of the rule), every 60 s |
| `GET` | `/home/household/push-config` | The public VAPID key of the house (HAS-284), read when the notifications of a device are switched on or made anew; `{}` when the deployment has none, and the card says the house sends none yet. Needs `database-service` 0.18.0 or later |
| `PUT` | `/home/household/member/{name}/push-subscriptions` | Stores the Web Push subscription of this browser for the member (`endpoint`, `keys`, `userAgent`) - an upsert by the endpoint; also at every start while switched on. `409 MEMBER_SWITCHED_OFF` has a text of its own |
| `DELETE` | `/home/household/member/{name}/push-subscriptions?endpoint=` | Removes it when the switch is turned off, after the browser ended it |
| `GET` | `/home/appliance` | The appliances of the household with their state, `finishedAt` and `awaitingSince` (the notice of every page, my room, overview), polled every 30 s and right after an acknowledgement. Needs `appliance-service` 0.3.0 and `api-gateway-service` 0.9.0 or later |
| `POST` | `/home/appliance/{id}/acknowledge?member=` | Marks a finished appliance as emptied (the notice, my room) - on my room also one still finishing (HAS-348, `appliance-service` 0.5.0: the cycle is then never announced) by the member of the profile in use, whom the household messages then name (HAS-347, `appliance-service` 0.4.0); the list is read again, the answer is not used. `409 NOTHING_TO_ACKNOWLEDGE`, `404 NOT_FOUND_APPLIANCE` and `400 UNKNOWN_MEMBER` have texts of their own |
| `GET` | `/home/appliance/{id}/runs?from=&to=`, `/home/appliance/{id}/samples?from=&to=` | The cycles and the power draw of one appliance - in the data-access class for the history of HAS-283, not called by a page yet |
| `GET` | `/home/device/registry` | Every device of the house with its room, kind, vendor and binding (devices, rooms). By the Devices and the Rooms page only, polled every 60 s while it is open and read again after every change. Needs `database-service` 0.12.0 and `api-gateway-service` 0.5.0 or later |
| `POST` | `/home/device/registry` | Registers a device (devices); needs `database-service` 0.13.0 or later, like the three below - and 0.15.0 or later for a `push button` (its SDK knows the kind; an older one answers a 400 without a code) |
| `PUT` | `/home/device/registry/{id}` | Replaces a device with the whole form - the registry has no partial update, so what it holds and this version does not know is sent back with it (devices). Not sent for a form nothing was changed in |
| `POST` | `/home/device/registry/{id}/enable`, `.../disable` | Switches a device on or off for the services (devices) |
| `DELETE` | `/home/device/registry/{id}` | Removes a device (devices), after a confirmation; an opening sensor that blinds still name is refused (`409 DEVICE_CONFLICT`, `database-service` 0.16.0) and not offered |

What the application relies on, in every call:

- **Errors** come in the shared contract of `cholewa-commons` (`{"errors":[{"message", "code"}]}`).
  The status survives any body - none, HTML from a proxy, JSON of another shape - and what a
  failing service (5xx) says about itself is never shown on screen. The message of a refused
  request (4xx) is shown exactly as sent - in English, also when the interface is Polish, and
  never run through the translations. Where a refusal carries a `code` the page knows, the page
  says it in its own words instead, in the language of the interface: the Household page does
  for the five codes of the household registry (`NOT_FOUND_HOUSEHOLD_MEMBER`,
  `HOUSEHOLD_CONFLICT`, `INVALID_HOUSEHOLD_MEMBER`, `DEVICE_EXIST`, `NOT_FOUND_MEMBER_DEVICE`).
- **The changes of the household registry go one after the other**, and never two at a time:
  every write there stores the whole row. The answer of a write is not used - the registry is
  read again - and a write that got no answer is told as "may have been carried out".
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
