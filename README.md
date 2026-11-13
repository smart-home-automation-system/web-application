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
  is on the heating page only. Then the hot water, the water of the house (HAS-322: the valve of the
  garage open or closed, its flow and the litres used today, and since HAS-402 the salt of the softener and the days
  it lasts), the boiler room, who is at home - with a warning
  when the detection has not checked for more than five minutes - the weather (temperature, dew
  point, wind and gusts, rain, daylight, and since HAS-431 the air quality in a word and its colour, no values), the blinds (HAS-254: how many are open, closed, moving
  and not known, read once a minute) and the lights (HAS-268: how many are on, off and not known,
  the rooms with a light on, and whether the house is empty and acted on) and the appliances
  (HAS-282: which of the washing machine, the dryer and the dishwasher runs and which waits to be
  emptied - nothing to press there) and the energy (HAS-341: the panels, the house and the grid now, the
  state of charge of the battery, a lost grid in red; since HAS-373 tomorrow of the production forecast in a line - "Tomorrow: poor, about 6 kWh"). Every call has its own freshness and its own failure, so the
  page stays whole while one service is down; the title of a tile leads to the dashboard that has
  the rest.
- **The weather strip**: in the panel of every page, for every member and on the profile picker:
  the outdoor temperature and humidity, led by an icon of rain or of a strong wind (8 m/s), with
  the age of the reading. A failed call keeps the last reading, its age marked, with the reason
  in a tooltip (a tap on a phone); with nothing to show - no answer yet, or a station not heard
  yet - it shrinks to an icon whose tooltip says why. Since HAS-431 a dot in the colour of the air quality
  after the humidity, its level and PM10 in its tooltip (a tap or a key); none for a level out of date.
- **Weather**: the weather station in detail - temperature with dew point and humidity, wind
  with gusts and its direction on a dial, rain now and the rain gauge, pressure, daylight and UV,
  and the station itself (whether its gateway answers, when it was last heard, battery and
  voltage) - and nine charts of the history over 24 hours, 7 or 30 days, one period for all:
  temperature and dew point, humidity, wind and gusts, daylight (logarithmic), rain per interval,
  pressure, PM1, PM2.5 and PM10. The page is 1800 px wide at most, as the water page.
  **The air quality** (HAS-431, the BleBox sensor of the garden): the level of the sensor on the scale of the
  air quality index of GIOS in a word and its colour (very good ... very bad), PM2.5 and PM10 with the level of
  each, PM1, an open smog episode the household was told of, the sensor on the station card (whether it
  answers, its silence), and a chart for each of PM1, PM2.5 and PM10 - PM2.5 with its thresholds of 35 and
  75 µg/m³, PM10 with 50 and 110, dashed once the readings come near them; the index has none for PM1.
- **Energy** (HAS-341, the administrator's, `/energy`): the energy of the house from `energy-service` -
  where it goes now (the panels above the house, the battery and the grid beside it, an arrow along each
  line by the sign of its power, "not known" where a power is not), the day so far, the grid as the SOLAX
  sees it and whether each source answers, a card each for the SOLAX (the strings, the run mode in words),
  the battery (the state of charge as a gauge, the energy left), the SOFAR (its state and faults in the
  words of the Solarman cloud) and the grid meter (per phase, a phase above 22 A marked), the open alarms
  and the outages of the grid of the last year; **the production forecast** (HAS-373) - one sentence of the coming
  days ("Little production for 3 days, better on Saturday (about 28 kWh, above the house load)"), the two closed days
  with what the forecast gave beside what was produced, seven days with the kWh of each inverter stacked, the
  category of the service in words and a colour, the share of the house load (the days from the fourth on paler),
  the mean house load of the last days as a dashed line across, the expected power of the next 48 hours and the
  performance ratio of each inverter; then the powers and the state of charge over 24 hours, 7
  or 30 days, the closed days as bars, and **the net-metering of the billing year** ("opusty") - per month
  what was returned, credited at the ratio, taken, covered by the credit and bought, and the credit "in the
  grid" now - all in kWh, never money; **the meter of Tauron** (HAS-417, from `energy-service` 0.17.0): every closed
  day of 7 or 30 the import and the export as the meter of the operator counts them (read from the eLicznik portal the
  morning after) beside the 3EM, how far apart in %, the sums of the days both know, "not yet" for a day the portal has
  not served; a day opens its hours in a window (the 25 hours of the night the clocks go back, the registers of the
  meter at its end), and the net-metering card settles the months of the operator beside the house's estimate, a month on one line of one table - the
  side of the invoice. **Charging the battery** (HAS-342): the charge from the grid started with
  its target and an optional end time, and while it goes on its state, who started it, its window, the battery
  now and the minutes to the target with "Stop charging" (a charge the automation started is asked about first:
  stopping it skips its outage); the switch of the charge before a planned outage of the street with its
  target, power and margin; the planned outages of Tauron with the start the charge would have and "No charge
  for this one"; the charges of the last 30 days. These are writes to the real inverter: "Charge from the grid" asks
  first too (HAS-417), in a window over the page, the commands in the bottom right corner of the card; every write is
  read again at once and 2.5 s later.
- **Air conditioning** (HAS-395, the administrator's, `/aircon`, from `aircon-service` >= 0.10.0; the filters
  from 0.11.0): every unit by room, a card each - the unit with its controls as on My room; **its filter** - the
  hours of work since it was cleaned and "Cleaned" after a question (the hours start again at 0); **its rule** in a
  few words with the editor - keep the room below a threshold (20-30 °C by 0.5, a hysteresis of 0.5-3 °C, cooling
  at 22-30 °C, never above the threshold - a copy of the rules of the service, so nothing it would refuse is sent)
  and the frost protection by the heating schedule, saved whole and read back, removed after a question; and its
  changes of the last 24 hours with who made them (the remote, the dashboard, a rule, the window, the empty house, a
  lost grid). Under them the two plugs that feed the units - what each draws now, whether its compressor runs, the
  energy of today, 7 and 30 days - with **the power cycle of the indoor units**: offered only while the service
  allows it (no indoor unit on, the plug at rest), after a question, its refusal printed as the service words it,
  the last cycle with who asked for it; and the draw of each plug over 24 or 48 hours with the line of 20 W above
  which a compressor runs.
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
- **Appliances** (HAS-283, the administrator's, `/appliances`): the washing machine, the dryer and the
  dishwasher of `appliance-service`, to tune their thresholds. At the top **the whole house** - the cycles
  and the energy of 24 hours, 7 and 30 days, every appliance added up. Then per appliance its card - its
  state, the same counters (a cycle whose energy is not known is named, never counted as 0 Wh; one that
  still runs is counted and adds no energy yet), its settings as the device registry holds them (read
  only, changed on the devices page) and its cycles of 7 or 30 days (start, duration, energy, emptied
  after how long and by whom) - and next to it **the draw of its plug** over the last 24 or 48 hours with
  its two thresholds drawn across it, where a washing pause or the turns of a dryer can be seen.
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
  **Each tile tells the state of its heating at a glance** (HAS-353): a word with its icon and the
  edge of the tile in its colour - heating, waiting for heat, warm enough, window open, not known,
  no schedule now (a dashed, quiet tile) - a light by the name of the room while a schedule covers
  it (the period and its temperature in the tooltip), and a line under the temperature by its
  distance to the target. With the heating of the house switched off every tile says so and the
  page says it once above the rooms. The heaters of a tile stand in columns - the kind, the flame,
  the name, the state. "Schedule" on a tile opens a window with the week of each heater and **the history of the
  temperature of the room** - the last 24 hours, 7 or 30 days, with the schedule the room has
  today as a dashed line. **The periods of each heater are written in that window** (HAS-357,
  `heating-service` 1.14.0): added, changed, switched off and on, and removed after a question -
  the days, from, to and a temperature of 5 to 30 °C in steps of 0.5. Every rule of the service is
  checked before anything is sent (a period ends before midnight and never overlaps another of the
  same heater, a switched-off one included); a period switched off stays on the list, struck
  through, and is not in the week - it never heats. After every write the rooms are read again and
  only that answer moves the list. The switch of the house asks before it acts, and what it shows
  afterwards is what the house answers when asked again, never what was clicked.
- **Water** (HAS-322, the hot-water page until then; laid out anew with HAS-402): a row of six cards of
  one size - **the water valve of the garage** (open or closed, the flow in l/min, the pressure in
  bar, the water temperature, with the age of its newest report, out of date after 3 minutes, and
  **"Close the valve" / "Open the valve" after a question** that says it cuts the water of the whole
  house - HAS-323; the card reads the valve again 2.5 s after the command and says while the valve
  has not confirmed it), **the water used** (today, this week, this month, this year and the counter
  in m³), the tank, whether
  the water asks to be heated - **heating going on stands out on a strip in the colour of the
  heating** -, the circulation and the alerts of the softener - and under them, in a row of three charts on one
  line, **the consumption of the house**
  by day (in hours), week and month (in days) and year (in months) as bars, in litres (a year in
  m³), with the total and the one of the range before; a day is chosen on a calendar or stepped back
  and forth. A bucket the service did not watch has no bar, never 0. Beside it the water per day and the salt
  of the softener, under them the softener, the history of the tank and of the circulation, the runs of
  today, and at the bottom **the bills of the waterworks** (HAS-323): newest first, each with what was billed, what the house measured over its
  period and how far apart they are - in m³ and per cent, a difference of 10 % or more on a red strip -
  with the amount and the meter reading when given; a bill is added and changed in a form that
  refuses what `water-service` refuses, and removed after a question. **Every question is a window over the
  page**, which is darkened and blurred under it - the card it was asked from keeps its size, and a click outside
  answers no. **No card moves while another period or day is asked for**: a chart keeps its place while the
  answer is on its way. Then the hot water:
- **Hot water**: the temperature of the water in the tank on a gauge from 20 to 80 °C - the water
  of a year, cold after a weekend away, hot from the sun in summer - with the band it is kept in
  (heated once it drops below 38 °C, until it is above 42 °C), **when the sensors were read** - a
  reading older than 6 minutes is marked out of date, because the service repeats its last one
  while the sensor is silent - whether the water asks to be heated, and **the history of the tank**
  (on the band it is kept in) **and of the circulation**, a card each, over the last 24 hours, 7 or 30 days.
- **The circulation pump** (HAS-406, `water-service` >= 0.13.0): running, stopped or not known
  (the service leaves out a read older than a minute), since when and what started it - by hand,
  or "not by the water service" for the scene of the Shelly cloud - the return temperature and the
  last run; **"Start circulation"** starts a run at once, with no question (a run of at most
  3 minutes that stops by itself), and reads the pump again 2.5 s later. A tank too cold is told
  in words. Under the history, **the runs of today**: when each started, what started it, how long
  it went, how it ended and the return at its start and end.
- **The water softener** (HAS-402, `water-service` >= 0.15.0 - 0.19.0): the salt on a gauge from 0 to 100 % with the
  days it lasts and the day it runs out (an amber warning below 20 %), the water used today, the daily average and the
  treated water left, the last regeneration, how many there were and whether one is scheduled or going on, the
  hardness in mg/l of CaCO₃ (the gpg set on the softener in a tooltip), the flags of the softener as chips (a flag the
  cloud leaves out is "not known", never clear) and the age of the reading - three columns of one height.
  **"Regenerate now" / "Regenerate tonight"** and **"Cancel the regeneration"** while one is scheduled, in the bottom
  right corner, each after a question; **"Live flow"**, a panel of its own tinted while it is on, holds the live
  stream of the cloud open while the switch is on and the page shown, so the flow moves as it happens. The salt over
  90 days with the regenerations marked as dashed lines and the litres per day of this month through the softener
  beside the water meter are cards of the row of the consumption; the alerts of the iQua cloud not yet read in the
  iQua application, coloured by their level - the salt in amber -, the sixth card of the first row: the newest four
  unread, the other unread ones counted; an alert read in the application leaves the card within five minutes, and
  with none unread the card says so, with the date of the last alert.
- **Boiler room**: a schematic of the furnace and the two pumps it feeds, with the state of
  every device, the last thing `boiler-service` noted about it and how long ago that was.

- **Presence**: who of the household is at home now, since when, and how long ago the
  detection last checked; the days of one resident as bars from 00:00 to 24:00 with the time at
  home, the first arrival and the last departure; and the days of the house with the stretches
  it stood empty - for today, 7 or 30 days, or two dates within the last 366 days. Only what
  was observed is drawn: time nobody looked at is hatched and named as such, never shown as
  absence.
- **My room**: the page of a household member, made for the phone - since HAS-438 the cards of a room
  and nothing else (owner 2026-11-13; what is the household's has pages of its own, below). It shows the rooms the registry gives the profile, one at a time - a member with
  several chooses among them, a member with none is told so. The cards of a room stand in this order (owner
  2026-11-13): the lights, the blinds, the heating, the sensors, the air conditioner. Per room: the temperature with
  the age of its reading, the humidity when the heating service reports one, the temperature
  the schedule asks for right now, each heater with what its relay last reported, the schedule
  of today, and the windows of the room with the hold of its heating, with the state of its
  heating in one word as on the heating page (HAS-353). Since HAS-254 also **the
  blinds of the room** - each with its position, open / stop / close as one bar, the position by a step of 10 % for one that
  can go to one (HAS-438), and the pause of its schedules until their next run (no card for a room without
  blinds; the schedules themselves stay the administrator's) - and **the motion and presence
  sensors** the registry places in the room - since HAS-369 with what they sense as `light-service` hears them: the room occupied, empty or not known, the motion going on or the last one, its light, and when each sensor was last heard and whether it is reachable. Since HAS-268 also **the
  lights of the room**: the occupancy of the room, each light with on / off, the brightness of a
  dimmer and the colour of an rgbw light, "All off", and the rule of the room in a few words with
  **the switch of the resident**, which stops the automatic lighting of the room until it is
  switched on again (no card for a room without lights; the rules themselves stay the
  administrator's). Since HAS-394 also **the air conditioner of the room** (`aircon-service` >= 0.5.0): on
  or off with its mode and target, the reading of its own sensor, whether the compressor runs, the open
  window that holds it and until when it is set back, whether it answers - and on / off, the mode, the
  target by a degree (cooling never below 22 °C, as the service refuses it), the fan by a step beside it (auto, then low
  to high - HAS-438) and quiet / turbo / sleep as buttons in the look of the modes (HAS-438), each read back (no card for a room without a unit). The heating is read-only; setting a temperature or a schedule is not part of
  this application for anybody yet, and will be the administrator's alone. The blinds, the
  lights and the air conditioner are the only controls of a room.
- **A resident's own pages** (HAS-438, owner 2026-11-13): besides My room, every member is offered
  **Appliances**, **Requests** and **Settings** - and **House heating** with the permission `heating_switch`.
  At most five entries, so all of them stand on the bottom bar of a phone, with no "More".
  - **Appliances** (`/appliances`): for every member **the appliances of the household** (HAS-282) - the
    washing machine, the dryer and the dishwasher with their state, running since or finished at, and
    "Emptied" for one that has finished and waits (the reminders of `appliance-service` stop with it) - and
    **"Mine this month"** (HAS-346). The administrator also gets everything that tunes them (below).
  - **Requests** (`/requests`): the card of the household requests (HAS-411, below) on a page of its own.
  - **Settings** (`/settings`): the appearance and the notifications of this device for every member; the
    palette for the administrator alone.
  - **House heating** (`/house-heating`): the switch of the heating of the whole house, the card of the heating
    dashboard, for a member the household registry granted `heating_switch` and nobody else - the
    administrator included, who switches the heating on its dashboard. Without the permission the address
    leads to My room and nothing is read.
- **The appliance notice**: above every page, for every member with a profile, a strip for each
  appliance that has finished and waits to be emptied, with since when, "Emptied" and a close
  button that hides it for the visit - it comes back with the next finished cycle. Nothing is
  said while the call fails. "Emptied" names the member of the profile and counts as the chore, just
  as the tag does (owner 2026-10-30); the administrator also gets **"Mute the reminders"**, which stops
  them without naming anybody - the cycle is nobody's chore (HAS-346).
- **The chores per member** (HAS-346): on the appliances page a table of every member - per appliance
  "emptied / cycles that finished while they were at home" and the share, for this month, the one before
  or the last three - with what was confirmed away from home, former members, the muted cycles and those
  without a recorded presence told apart; for every member the card **"Mine this month"** with the same figures
  of the member of the profile. From the report of `appliance-service` 0.9.0.
- **The requests of the household** (HAS-411): on the requests page (on My room until HAS-438), for every member, the card **"Requests"** - the
  errands the household wrote for the member of the profile, with who wrote them, when, and whether the SMS of
  08:00 already carried them (notification-service 0.9.0); each ticked off with "Done" or removed, those done in
  the last 30 days folded under the list. A form writes a request for anybody of the household - the member of
  the profile chosen first - one line of up to 100 characters, checked before it is sent as
  `database-service` checks it. Under the form **"Written by you for the others"** (0.46.1): what the member of
  the profile wrote for the rest of the household - for whom, when, whether the SMS went, the last written on top,
  each removable, those ticked off folded - so that a request written for somebody else can be seen to have been
  added. Nothing optimistic: after a change the list is read again. Needs `database-service` 0.22.0; against an
  older one the card shows the failure and the rest of the page works.
- **The tag page** (HAS-346, `/t`): what a phone held to the NFC tag on an appliance opens -
  `/t?picc_data=…&cmac=…`, the read of an NTAG 424 DNA (HAS-343, programmed per
  `docs/nfc-tag-programming.pdf` of deployment-tools). It claims the chore of that appliance at once for
  the member the browser remembers and says on the whole screen how it ended - "Dryer emptied, recorded
  for Borys", or in words why not: the read cannot be checked, it was used before, nothing has finished
  in the last 12 hours. The tag opens the **default browser** of the phone, never the installed
  application, and that browser keeps its own profile: when it knows nobody the page asks "Who is
  holding the phone?" once and remembers the choice as the profile of that browser, as a personal link
  does; "Not you?" changes it. A read counts once: the address loses it the moment it is taken (a
  reload sends nothing), and after a claim recorded for the wrong person the next read of the tag is
  the one for the right one. No navigation on this page, and no guard of the profiles.
- **Notifications on this device** (HAS-284): on the settings of every member (on My room too until HAS-438), a
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
  sensor, the brand, serial and address of an inverter (HAS-341), and the water valve as a Shelly of generation 2 or
  later on the channel 0 (HAS-313), the MAC and address of an air conditioner of the vendor Gree (HAS-392, from
  `database-service` >= 0.23.0 - the MAC as the unit gives it, written with colons or dashes or without), the id and
  address of the air quality sensor of the vendor BleBox (HAS-426, from `database-service` >= 0.25.0 - the id as its
  `GET /info` gives it). And the forms to register a device, change one, switch one off and on for the
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

The hot water, the boiler room and the presence are read-only. The water page writes in four places:
the command of the valve, after a question, and the bills of the waterworks (HAS-323), the start
of the circulation pump (HAS-406), and the regeneration of the softener, after a question, with its
live flow (HAS-402); after every write it reads again, and only that answer moves the page.

Every view stands in the **middle of the page**, with its title in the top left corner, and the
cards of a row are of one size (HAS-266).

**The charts** are drawn with ECharts, downloaded by the first view that shows one and never
with the first page. A history is asked for with its two ends only - the services choose how
the range is cut into buckets. **A line stays whole, and an outage stays visible** (HAS-375): a
silence up to two buckets - for a room up to 3 hours, since a battery thermometer reports on a
change only - is drawn through as the line it is; a longer one (the database down, a sensor
silent) is bridged by a faint dotted line, and the tooltip there says "no readings" with the
readings on both sides, never a value made up between them. The dashed line of a room is the
schedule the room has *today*: what was in force on a past day is stored nowhere, and the chart
says so.

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
| `resident` | My room - their rooms, read-only but for their blinds, lights and air conditioner - and since HAS-438 the appliances, the requests and the settings of this device (House heating too with its permission). Every other address - typed by hand included - leads to My room, and other profiles are not offered. |

Next to the role the registry can grant a member a **permission** - one thing beyond what the
role gives. There is one so far, `heating_switch`: the switch of the heating of the whole house
on a tab of its own, House heating (on My room until HAS-438). The administrator grants and withdraws it on the Household
page (`PUT /home/household/member/{name}/permissions` of `database-service`). Without it there is no such tab, for a resident
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
| `GET` | `/home/heating` | State of the heating system switch and the time of its last change (overview tile, heating, and house heating for a member with `heating_switch`), polled every 30 s, and once more right after every change of the switch |
| `POST` | `/home/heating?turn=on\|off` | Switches the heating of the whole house (heating, and house heating for a member with `heating_switch`), after a confirmation. Its answer is not used: the state is read again |
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
| `GET` | `/home/water/valve` | The water valve now - state, flow, pressure, water temperature, counter, the time of its newest report (water, overview), polled every 15 s. A field left out is shown as not known; `{}` before the first report. Needs `water-service` 0.7.0 or later - against an older one the card shows the 404 |
| `POST` | `/home/water/valve?state=open\|close&source=dashboard` | Closes or opens the valve, after a question (water); the valve is read again 2.5 s later. Needs `water-service` 0.12.0 or later |
| `GET`, `POST`, `PUT`, `DELETE` | `/home/water/bills`, `/home/water/bills/{id}` | The bills of the waterworks with what the house measured (water), read every 5 min and again after every write. Needs `water-service` 0.9.0 or later |
| `GET` | `/home/water/consumption?range=&at=` | The water used over a day, week, month or year in buckets, with the total and the one before (water; today on the overview), asked when the range or the day changes, then every minute. Needs `water-service` 0.8.0 or later |
| `GET` | `/home/boiler/status` | The furnace and both pumps: `working` and the last note of the service with its time (boiler room, overview), polled every 30 s |
| `GET` | `/home/weather/current` | Every metric of the weather station with `value`, `measuredAt` and `stale` (the strip on every page, overview, weather), polled every 60 s by one resource for all. A metric never heard is not in the answer and is not drawn; `{}` is a station not heard yet. Since HAS-431 also `pm1`, `pm25`, `pm10` and `airQualityLevel` of the air quality sensor (`weather-service` 0.5.0). Needs `weather-service` 0.4.0 and `api-gateway-service` 0.6.0 or later |
| `GET` | `/home/weather/status` | How the service hears the station: its gateway (answers or not, when checked), when the station was last heard, `silent` after 30 min (weather), polled every 60 s; since HAS-431 `airSensor` - whether the air quality sensor answers, its silence and an open `smog` episode (`weather-service` 0.7.0) |
| `GET` | `/home/weather/history?metric=&from=&to=` | One metric over a range, averaged into buckets with `min` / `max` (weather: temperature, dew point, humidity, wind, gust, illuminance, precipitation, pressure, and since HAS-431 PM1, PM2.5 and PM10 - `weather-service` 0.6.0). Asked when the period changes, then every 3 min. An unknown metric is `UNKNOWN_METRIC` |
| `GET` | `/home/household/profiles` | The profiles of the household: the name, role, rooms and permissions of every active member, and nothing else (`database-service` 0.10.0 or later; the permissions from 0.11.0 - an older one sends none, and nobody then has the House heating tab). Asked at every start, whenever the page comes back into view, by the profile picker and when a personal link is opened - and after every change made on the Household page |
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
| `POST` | `/home/heating/rooms/{room}/heaters/{heater}/schedules` | A new period of a heater (the window of a room on the heating page, HAS-357): body `{days, startTime, endTime, temperature}`, the times `HH:mm`; the rooms are read again, the answer is not used. Needs `heating-service` 1.14.0 |
| `PUT` / `DELETE` | `/home/heating/schedules/{id}` | Changes a period whole (whether it is on stays) or removes it - `NOT_FOUND_SCHEDULE` on a removal counts as removed; the rooms are read again |
| `PUT` | `/home/heating/schedules/{id}/enabled?value=true\|false` | Switches a period on or off; the rooms are read again. `INVALID_SCHEDULE` (its reason only in `details`, never shown - every rule is checked first), `NOT_FOUND_SCHEDULE`, `NOT_FOUND_HEATER` and `NOT_FOUND_ROOM` have texts of their own |
| `POST` | `/home/blinds/{id}?command=open\|close\|stop&source=dashboard`, `/home/blinds/{id}/position?value=` | Moves a blind (rooms). No question first; its answer is not used: the blinds are read again |
| `PUT` / `DELETE` | `/home/blinds/{id}/schedule-pause` | Pauses the schedules of a blind until their next run, or ends the pause (rooms, blinds) |
| `POST` | `/home/blinds/rooms/{room}?command=open|close|stop&source=dashboard` | Moves every blind of a room (blinds); the whole house is every room with blinds, one after the other. The blinds it skipped are told |
| `GET` | `/home/blinds/schedules`, `/home/blinds/schedules/{id}/today` | The schedules of the blinds and what the engine makes of each today (blinds), the list and then each day one after the other, every 60 s |
| `POST` | `/home/blinds/schedules/{id}/enable`, `/disable` | Switches a schedule on or off (blinds); the schedules are read again |
| `GET` | `/home/calendar/days?from=&to=` | The days of the next 60 days of the house (blinds: the holidays on weekdays), every 15 min. Needs `database-service` 0.14.0 or later |
| `GET` | `/home/light` | Every light by room with its state, brightness, reachability and `heldUntil` (rooms), polled every 10 s and right after every command. Needs `light-service` 0.6.0 and `api-gateway-service` 0.8.0 or later |
| `GET` | `/home/aircon` | Every air conditioner with its state (overview tile, HAS-394), polled every minute |
| `GET` | `/home/aircon/automation` | When the empty house or a lost grid last switched the units off (overview tile), polled every minute |
| `GET` | `/home/aircon/rooms/{room}` | The units of a room (my room, HAS-394), polled every 10 s; a 404 with the code `NOT_FOUND_ROOM` means no card |
| `POST` | `/home/aircon/{id}?source=dashboard` | A command to a unit - power, mode, target, fan, quiet, turbo, sleep (my room, air conditioning); checked against a copy of `CommandRules` first; the units are read again at once and 2.5 s later |
| `GET` | `/home/aircon/rules` | The rule of every unit (air conditioning, HAS-395), polled every minute and read again after a write |
| `PUT`, `DELETE` | `/home/aircon/{id}/rules` | Writes the rule of a unit whole (checked against a copy of `RuleRules` first) or removes it after a question (air conditioning); a removal answered `NOT_FOUND_RULE` counts as removed |
| `POST` | `/home/aircon/{id}/filter-cleaned` | The filter of a unit cleaned, after a question (air conditioning); the units are read again. Needs `aircon-service` 0.11.0 or later |
| `GET` | `/home/aircon/{id}/runs?from=&to=` | The changes of a unit over the last 24 hours with who made them (air conditioning), asked only while they are open, then every minute |
| `GET` | `/home/aircon/power` | The two plugs of the units - power now, compressor, the energy of today, 7 and 30 days (air conditioning), polled every 30 s |
| `GET` | `/home/aircon/power/samples?plug=&from=&to=` | The draw of one plug in buckets over 24 or 48 hours (air conditioning), asked when the period changes, then every minute |
| `GET`, `POST` | `/home/aircon/power-cycle` | Whether the indoor plug may be power cycled now and the last cycle, polled every 30 s; the cycle itself after a question, with the member of the profile (air conditioning). Needs `aircon-service` 0.10.0 or later |
| `POST` | `/home/light/{id}?turn=on\|off&source=dashboard`, `/home/light/{id}/brightness?value=1..100&source=dashboard` | Switches a light by its registry id, sets the brightness of a dimmer or an rgbw light (rooms). The rules engine holds a light changed from here; the lights are read again |
| `GET` | `/home/light/rooms/{room}/rules` | The rule of a room (my room: every 60 s; the editor of the rule: once, and again after a save); `404 NOT_FOUND_RULE` is a room without one. Needs `light-service` 0.6.0 or later |
| `PUT` / `DELETE` | `/home/light/rooms/{room}/rules` | Writes the rule of a room whole, or removes it (the editor of the rule, HAS-267); the rule is read again, the answer of the write is not used. `INVALID_RULE` names what the service refused only in `details`, which is never shown - the editor checks every rule of the service first |
| `PUT` | `/home/light/rooms/{room}/rules/resident-enabled` | The switch of the resident (my room, the editor of the rule); the rule is read again |
| `GET` | `/home/light/rooms/{room}/rules/runs?from=&to=` | What the rules engine sent in a room in the last 24 hours (the window of a room, the editor of the rule), every 60 s |
| `GET` | `/home/household/push-config` | The public VAPID key of the house (HAS-284), read when the notifications of a device are switched on or made anew; `{}` when the deployment has none, and the card says the house sends none yet. Needs `database-service` 0.18.0 or later |
| `PUT` | `/home/household/member/{name}/push-subscriptions` | Stores the Web Push subscription of this browser for the member (`endpoint`, `keys`, `userAgent`) - an upsert by the endpoint; also at every start while switched on. `409 MEMBER_SWITCHED_OFF` has a text of its own |
| `DELETE` | `/home/household/member/{name}/push-subscriptions?endpoint=` | Removes it when the switch is turned off, after the browser ended it |
| `GET` | `/home/household/member/{name}/requests?done=true` | The requests of the member of the profile - open, and done in the last 30 days (the requests page, HAS-411), every 60 s and right after a change; the same read of every other profile, one after the other, for what the member of the profile wrote for them. Needs `database-service` 0.22.0 |
| `POST` | `/home/household/member/{name}/requests` | Writes a request for that member: body `{text, author}`, the author the member of the profile; the text checked first as the service checks it |
| `PUT` | `/home/household/member/{name}/requests/{id}/done?member=` | Ticks a request off as the member of the profile; the list is read again |
| `DELETE` | `/home/household/member/{name}/requests/{id}` | Removes a request; `NOT_FOUND_REQUEST` counts as removed. The codes `INVALID_REQUEST`, `MEMBER_SWITCHED_OFF` and `NOT_FOUND_HOUSEHOLD_MEMBER` have texts |
| `GET` | `/home/appliance` | The appliances of the household with their state, `finishedAt` and `awaitingSince` (the notice of every page, my room, overview), polled every 30 s and right after an acknowledgement. Needs `appliance-service` 0.3.0 and `api-gateway-service` 0.9.0 or later |
| `POST` | `/home/appliance/{id}/acknowledge?member=` | Marks a finished appliance as emptied (the notice, my room) - without `member` for the administrator's "Mute the reminders" on the notice (HAS-346: the cycle is nobody's chore); on my room also one still finishing (HAS-348, `appliance-service` 0.5.0: the cycle is then never announced) by the member of the profile in use, whom the household messages then name (HAS-347, `appliance-service` 0.4.0); the list is read again, the answer is not used. `409 NOTHING_TO_ACKNOWLEDGE`, `404 NOT_FOUND_APPLIANCE` and `400 UNKNOWN_MEMBER` have texts of their own |
| `GET` | `/home/appliance/reports/members?from=&to=` | The chores per member of whole months of the house (the appliances page), every 60 s; `INVALID_RANGE` has a text. Needs `appliance-service` 0.9.0 |
| `POST` | `/home/appliance/claims` | The chore of the appliance a tag is on, claimed by the member of the browser (the tag page, HAS-346): body `{piccData, cmac, member}`, sent once per read; the answer names the appliance and the member. `INVALID_TAG`, `REPLAYED_TAG`, `NOTHING_TO_CLAIM`, `NOT_FOUND_APPLIANCE` and `UNKNOWN_MEMBER` have texts of their own. Needs `appliance-service` 0.7.0 |
| `GET` | `/home/appliance/{id}/runs?from=&to=` | The cycles of one appliance that started in the range (appliances: the last 30 days of every appliance, one after the other, every 60 s - the counters and the lists read that one answer) |
| `GET` | `/home/appliance/{id}/samples?from=&to=` | The draw of the plug, a sample every 30 s (appliances: the last 24 or 48 hours of each appliance, every 60 s) |
| `GET` | `/home/device/registry?kind=appliance&enabled=true` | The appliances with their settings (appliances, read only, every 60 s) |
| `GET` | `/home/energy/flows` | Where the energy goes now and the day so far (energy: every 15 s; overview: every 60 s). The SOC beside the battery of the diagram is the read of `/home/energy/battery`. Needs `energy-service` 0.8.0 and `api-gateway-service` 0.10.0 or later |
| `GET` | `/home/energy/status` | The sources and the grid as the SOLAX sees it (energy: every 30 s; overview: every 60 s) |
| `GET` | `/home/energy/grid`, `/home/energy/inverters`, `/home/energy/battery` | The grid meter, both inverters and the battery now (energy, every 15 s; the battery also on the overview, every 60 s) |
| `GET` | `/home/energy/forecast` | The production forecast of the coming days (energy and overview, every 5 min). Needs `energy-service` 0.16.0; the categories are the service's, no band is copied |
| `GET` | `/home/energy/alerts` | The open alarms (energy, every 60 s). Needs `energy-service` 0.10.0 |
| `GET` | `/home/energy/outages?from=&to=` | The outages of the grid of the last year (energy, every 60 s) |
| `GET` | `/home/energy/battery/charge` | The charge going on with the battery now and the start the automation would plan (energy, every 10 s). Needs `energy-service` 0.13.0 |
| `POST` | `/home/energy/battery/charge?source=dashboard` | Starts a charge from the grid - **a write to the inverter** - with `{targetSoc, until}` (energy); the codes of the service have texts |
| `DELETE` | `/home/energy/battery/charge` | Stops the charge going on and sets the inverter back (energy) |
| `GET` | `/home/energy/battery/charge/runs?from=&to=` | The charges of the last 30 days (energy, every 60 s) |
| `GET`, `PUT` | `/home/energy/automation` | The switch and the settings of the charge before a planned outage, written whole and read again (energy, every 60 s); `INVALID_AUTOMATION` has a text |
| `GET` | `/home/energy/outages/planned` | The outages Tauron announces for the house, with the planned start of the charge (energy, every 60 s) |
| `PUT` | `/home/energy/outages/planned/{id}/skip`, `.../unskip` | No automatic charge for an outage, or allowed again (energy) |
| `GET` | `/home/energy/history?metric=&from=&to=` | `pv-power`, `house-load`, `grid-power` and `battery-soc` over the period of the page (energy, every 3 min); `UNKNOWN_METRIC` and `INVALID_RANGE` have texts |
| `GET` | `/home/energy/days?from=&to=` | The closed days up to yesterday, 7 or 30 (energy, every 15 min) - since `energy-service` 0.17.0 with `elicznikImport` / `elicznikExport`, the meter of Tauron (HAS-417: the days card and the card of the meter, two calls) |
| `GET` | `/home/energy/elicznik?from=&to=` | One day of the meter of Tauron hour by hour, with the registers of the meter (energy: the window of a day, every 15 min). Needs `energy-service` 0.17.0 |
| `GET` | `/home/energy/months?year=` | The net-metering of a billing year (energy, every 15 min); since `energy-service` 0.17.0 the months of the meter of Tauron (`elicznik*`) settled beside it |
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
- **The state of a room is the first of these that holds** (HAS-353, `roomState`): the heating of
  the house switched off; a window or a door holding the room; a heater working; not known (no
  temperature, or a heater whose relay has not answered - missing is never "off"); waiting (a
  schedule covers the room and it is colder than asked); warm enough; no schedule now. "A schedule
  covers the room" is `scheduledTemperature` being there, not `inSchedule` (which the service sets
  only below the target). My room does not read the switch of the house - only a member allowed to
  switch it asks for it - so there a room tells its own state.
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
