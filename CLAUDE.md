# web-application

Angular frontend for the Smart Home Automation System. **This is the one repository where
Claude has full implementation autonomy** — the user is a backend (Java/Spring) developer
and relies on the rules below for consistency. Follow them strictly; when a new
architectural decision is needed, propose it in the PR description rather than silently
inventing a pattern.

## Stack

- Angular 22, standalone components, **zoneless** change detection, signals
- TypeScript strict, SCSS, Angular Material (light + dark theme)
- Unit tests: Vitest (`ng test`), no SSR

## Architecture rules

Folder layout (feature-based):

```
src/app/
  core/           # singletons: app config, profile store, HTTP setup, future auth hooks
  shared/         # reusable presentational components, pipes, directives
  data-access/    # one injectable service per backend domain (heating, water, boiler, …)
  features/       # routed features: profile-select, home, rooms/<room>, settings, …
```

- **Data access**: components NEVER use `HttpClient` directly. Every backend domain gets a
  service in `data-access/` exposing signals. Transport today: **polling** of REST
  endpoints through the api-gateway. Keep polling internal to the service so a future
  switch to SSE changes only that file.
- **Profiles, no login**: first visit shows a household-member profile picker; the choice
  is persisted in `localStorage` and switchable from the menu. The home page is
  personalized per profile: the profile's own room first, shortcuts to frequently used
  controls from other rooms, and the common areas shared by everyone.
- **Future auth**: keep a single extension point — an HTTP interceptor + route guard stub
  in `core/` — so JWT auth (api-gateway + cholewa-security) can be added without touching
  features.
- **State**: signals. Component-local state stays in the component; cross-feature state
  lives in small injectable stores (`core/` or the owning feature).
- Modern Angular only: `input()`/`output()`/`inject()`, built-in control flow
  (`@if`/`@for`), no NgModules, no constructor injection, no `any`.
- Desktop-first layouts, but every view must remain usable on a phone (responsive).

## Backend integration

- All HTTP goes through `api-gateway-service`, base path `/home`.
- Dev server proxies `/home` → `http://localhost:6200` (see `proxy.conf.json`); adjust
  target locally, never commit private hosts/IPs — this repo is public.

## Commands

- `npm start` — dev server (with API proxy)
- `npm run build` — production build; must pass before any PR
- `npm test` — unit tests (Vitest; single run when non-interactive)

## Workflow (strict)

1. Never commit to `main`. Every change goes on a **`feature/HAS-<n>`** branch, where
   `<n>` is the Jira task number (HAS project) — this is an org-wide rule. If no Jira
   task covers the change, have one created first (`jira-backlog`) or ask the user.
2. Definition of done for any change: production build passes, unit tests pass,
   `/code-review` of the own diff, and visual verification in a browser for UI changes
   (attach a screenshot to the PR).
3. Open a PR to `main` with a plain-language description of what changed and why —
   **the user personally reviews every PR before merging**, so explain frontend-specific
   decisions in terms a backend developer can judge.
4. CI (`.github/workflows/CI.yml`) builds and tests on feature-branch pushes and PRs,
   mirroring the org convention.
