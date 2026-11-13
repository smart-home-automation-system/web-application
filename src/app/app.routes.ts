import { Route, Routes } from '@angular/router';

import { BackgroundName } from './core/background/backgrounds';
import { Shell } from './core/layout/shell';
import { Access } from './core/profile/access';
import { profileGuard } from './core/profile/profile-guard';
import { MemberPermission } from './core/profile/profile';
import { ErrorPage } from './features/error/error-page';
import { MessageKey } from './i18n/messages';

/**
 * A page of the application: its `title` is the key of the text shown in the browser tab, and
 * `data.background` names the photo behind it (`core/background/backgrounds.ts`); without one
 * the page shows the plain glow. `data.access` says who may open it (`core/profile/access.ts`):
 * **a page that does not say is the administrator's alone**. `data.permission` asks for a permission of
 * the registry beyond the access (HAS-438) - only a member granted it opens the page.
 */
type Page = Route & {
  title?: MessageKey;
  data?: { background?: BackgroundName; access?: Access; permission?: MemberPermission };
};

const pages: Page[] = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    title: 'nav.overview',
    data: { background: 'home' },
    loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
  },
  {
    path: 'heating',
    title: 'nav.heating',
    data: { background: 'heating' },
    loadComponent: () => import('./features/heating/heating').then((m) => m.Heating),
  },
  {
    path: 'water',
    title: 'nav.water',
    data: { background: 'water' },
    loadComponent: () => import('./features/hot-water/hot-water').then((m) => m.HotWater),
  },
  {
    path: 'boiler',
    title: 'nav.boilerRoom',
    data: { background: 'boiler' },
    loadComponent: () => import('./features/boiler-room/boiler-room').then((m) => m.BoilerRoom),
  },
  {
    path: 'weather',
    title: 'nav.weather',
    data: { background: 'weather' },
    loadComponent: () => import('./features/weather/weather').then((m) => m.Weather),
  },
  {
    // the energy of the house (HAS-341, the administrator's): the flows now, the inverters, the battery,
    // the history, the net-metering, the alarms and the outages of the grid
    path: 'energy',
    title: 'nav.energy',
    data: { background: 'energy' },
    loadComponent: () => import('./features/energy/energy').then((m) => m.Energy),
  },
  {
    // the air conditioners (HAS-395, the administrator's): every unit with its rule and filter, the plugs,
    // the power cycle of the indoor units and the draw of each plug
    path: 'aircon',
    title: 'nav.aircon',
    data: { background: 'aircon' },
    loadComponent: () => import('./features/aircon/aircon').then((m) => m.Aircon),
  },
  {
    // every room of the house, its devices, and the lights and blinds controlled from it (HAS-232)
    path: 'rooms',
    title: 'nav.rooms',
    data: { background: 'rooms' },
    loadComponent: () => import('./features/rooms/rooms').then((m) => m.Rooms),
  },
  {
    // every blind of the house, the schedules of the blinds and the holidays they count (HAS-252)
    path: 'blinds',
    title: 'nav.blinds',
    data: { background: 'blinds' },
    loadComponent: () => import('./features/blinds/blinds').then((m) => m.Blinds),
  },
  {
    // every light of the house, the occupancy of its rooms, their rules and the empty house (HAS-266)
    path: 'lights',
    title: 'nav.lights',
    data: { background: 'lights' },
    loadComponent: () => import('./features/lights/lights').then((m) => m.Lights),
  },
  {
    // the appliances (HAS-283, the administrator's): cycles, counters and the draw of the plugs
    path: 'appliances',
    title: 'nav.appliances',
    // every member since HAS-438: the appliances and the chores for all, the rest for the administrator
    data: { access: 'member', background: 'appliances' },
    loadComponent: () =>
      import('./features/appliances/appliances-page').then((m) => m.AppliancesPage),
  },
  {
    // HAS-438: the requests of the household on a page of their own, for every member
    path: 'requests',
    title: 'nav.requests',
    data: { access: 'member', background: 'room' },
    loadComponent: () => import('./features/requests/requests-page').then((m) => m.RequestsPage),
  },
  {
    // HAS-438: the switch of the heating of the whole house, for a member granted it alone
    path: 'house-heating',
    title: 'nav.houseHeating',
    data: { access: 'member', permission: 'heating_switch', background: 'heating' },
    loadComponent: () =>
      import('./features/house-heating/house-heating-page').then((m) => m.HouseHeatingPage),
  },
  {
    // the editor of the rule of a room (HAS-267): one page per room, the room named by the address
    path: 'lights/rooms/:room/rules',
    title: 'lights.editor.title',
    data: { background: 'lights' },
    loadComponent: () =>
      import('./features/lights/rule-editor/rule-editor').then((m) => m.RuleEditor),
  },
  {
    // the editor of a schedule of the blinds (HAS-253): a new one, `?room=` to start with a room
    path: 'blinds/schedules/new',
    title: 'blinds.editor.titleNew',
    data: { background: 'blinds' },
    loadComponent: () =>
      import('./features/blinds/schedule-editor/schedule-editor').then((m) => m.ScheduleEditor),
  },
  {
    path: 'blinds/schedules/:id',
    title: 'blinds.editor.title',
    data: { background: 'blinds' },
    loadComponent: () =>
      import('./features/blinds/schedule-editor/schedule-editor').then((m) => m.ScheduleEditor),
  },
  {
    path: 'presence',
    title: 'nav.presence',
    data: { background: 'presence' },
    loadComponent: () => import('./features/presence/presence').then((m) => m.Presence),
  },
  {
    path: 'room',
    title: 'nav.myRoom',
    data: { access: 'member', background: 'room' },
    loadComponent: () => import('./features/my-room/my-room').then((m) => m.MyRoom),
  },
  {
    path: 'household',
    title: 'nav.household',
    data: { background: 'household' },
    loadComponent: () => import('./features/household/household').then((m) => m.Household),
  },
  {
    path: 'devices',
    title: 'nav.devices',
    data: { background: 'devices' },
    loadComponent: () => import('./features/devices/devices').then((m) => m.Devices),
  },
  {
    path: 'settings',
    title: 'nav.settings',
    // every member since HAS-438: the appearance and the notifications of this device
    data: { access: 'member', background: 'settings' },
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'about',
    title: 'nav.about',
    data: { background: 'about' },
    loadComponent: () => import('./features/about/about').then((m) => m.About),
  },
  {
    path: 'profiles',
    title: 'profiles.title',
    data: { access: 'chooser' },
    loadComponent: () => import('./features/profiles/profiles').then((m) => m.Profiles),
  },
  {
    // the personal link of a household member: opens their profile in this browser
    path: 'u/:member',
    title: 'personalLink.title',
    data: { access: 'anyone' },
    loadComponent: () =>
      import('./features/personal-link/personal-link').then((m) => m.PersonalLink),
  },
  {
    path: 'error',
    title: 'errorPage.title',
    data: { access: 'anyone' },
    // not lazy: this page is shown when a lazy chunk can no longer be downloaded
    component: ErrorPage,
  },
  {
    path: '**',
    title: 'notFound.title',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];

/**
 * No path here may start with `home`: the ingress sends everything under `/home` to
 * `api-gateway-service`, so such a page would never reach this application.
 */
export const routes: Routes = [
  {
    // The page an NFC tag on an appliance opens (HAS-346): a phone held to the tag, the outcome on the
    // whole screen. Outside the shell - no navigation - and outside the guard of the profiles: it is
    // opened in a browser that may know nobody, and asks who holds the phone itself.
    path: 't',
    title: 'tagClaim.title',
    loadComponent: () => import('./features/tag/tag-claim').then((m) => m.TagClaim),
  },
  { path: '', component: Shell, canActivateChild: [profileGuard], children: pages },
];
