# Optional usage analytics

GitSomething's source adds opt-in PostHog usage analytics for production native desktop builds. The default is Off. Opening the app, connecting GitHub, or using a repository does not grant consent. Use **Usage sharing** in the Home footer or **Privacy & usage sharing** in the command menu to change the preference. The dialog opens only when requested.

This integration requires a newly built application. Previously released beta installers do not acquire analytics from a source change or a PostHog dashboard setting.

## User choices

| Mode                       | Behavior                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Off                        | Send no usage analytics from this device. This is the initial state.                                                                                                            |
| Anonymous usage            | Share allowed action counts and app version without a GitHub username.                                                                                                          |
| Usage with GitHub username | Share the same allowed usage with the current public GitHub login after sign-in. The user may select this mode before connecting; no username is included until GitHub sign-in. |

The selection applies to future events. Turning sharing off, signing out, or changing modes does not delete events already shared. A GitHub connection alone is not analytics consent, and anonymous usage must not acquire a GitHub username when an account connects later.

Usage is shared with GitSomething's maintainers through PostHog in the EU. App events must not contain repository names, local paths, source code, file contents, commit messages, provider tokens, or credentials. Session replay is disabled. The preferences surface explains the recipient, action/version scope, and these exclusions before a user chooses either opt-in mode.

## Component and integration boundary

`src/components/privacy/AnalyticsPreferences.tsx` is a controlled Radix dialog with `open`, `onOpenChange`, and optional `accountLogin` props. Native radio controls share the analytics store through `getAnalyticsMode`, `setAnalyticsMode`, and `subscribeAnalyticsMode`; changes apply immediately. `analyticsConfigured` controls the unavailable-build explanation, while choices remain accessible. The module supplies named modes `off`, `anonymous`, and `identified`.

Home/footer and command-palette entry points belong to the application integration. A trigger may use `data-analytics-preferences-trigger` as the dialog's focus-return fallback if a palette item unmounts. The dialog focuses the selected radio on opening, traps focus through Radix, supports native radio keyboard navigation, and returns focus to its opener when available. It does not initiate Git operations or write to the Glass Box.

Production native execution, explicit consent, and valid project configuration are independent gates. The production-origin check allows `tauri://localhost` and HTTP(S) on `tauri.localhost`, together with a production build and Tauri runtime. Development and browser-demo sessions are excluded even when ingestion configuration exists. Native practice/demo actions also require an explicit caller guard before instrumentation. Configuration, event allowlists, identity transitions, storage behavior, and transport belong to `src/lib/analytics.ts` and the root integration.

## Configuration and local state

The core integration uses a public PostHog ingestion token and EU ingestion host. Those are client configuration, not owner-dashboard credentials. No administrative or personal PostHog API key belongs in the desktop bundle.

The module stores the validated preference under `gitsomething.analytics.mode.v1`, defaulting to `off`, with an in-memory fallback if local storage is unavailable. Its installation identity uses `gitsomething.analytics.anonymous-id.v1`; it is created only after consent in a configured production native session and has the form `gitsomething:anonymous:<UUID>`. Every actual mode change discards the previous anonymous identity, including a change from anonymous to username sharing. Switching Off removes it without creating a replacement. Disconnecting or changing accounts while username sharing is selected also clears the anonymous identity and cancels pending named activity.

The current public GitHub login is validated, lowercased, and held in memory; email addresses and avatar URLs are excluded. In username-sharing mode after sign-in, events use `distinct_id: gitsomething:github:<login>` and `properties.$set.github_login`. Before sign-in, the same opted-in mode can send anonymous events. There are no separate identify events, aliases, or anonymous-history merges: choosing username sharing applies only to subsequent events.

The application-managed anonymous installation ID can persist in local storage until the transitions described above. There is no SDK persistence or analytics cookie. Anonymous usage means usage without a GitHub username, not a promise that every individual event is unlinkable.

## Capture transport and cancellation

The application sends one explicit JSON POST per allowed action to `https://eu.i.posthog.com/i/v0/e/` using [PostHog's public Capture API](https://posthog.com/docs/api/capture). The explicit transport has no SDK queue or flush behavior to manage during opt-out.

Each request uses `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'no-store'`, and `keepalive: false`. A request-specific `AbortController` cancels it after five seconds. Mode changes and changes to the active named account cancel pending attempts. There are no queues, retries, unload beacons, or later background resends; analytics failure never blocks a Git operation. Aborting cannot recall an event that the service already received, and changing preferences does not delete historical data.

## Event and property boundary

The fixed event names are:

```text
gitsomething app opened
gitsomething repository opened
gitsomething repository cloned
gitsomething git action
gitsomething github connected
gitsomething github disconnected
gitsomething guide opened
gitsomething guide completed
gitsomething repository published
```

The only caller-supplied properties accepted are static labels: action (`stage`, `unstage`, `commit`, `fetch`, `pull`, `push`, `rescue`, `status`, or `diff`), outcome (`success` or `error`), source (`local` or `github`), provider (`github` or `gitlab`), and visibility (`public` or `private`). The module adds fixed `app_name: 'GitSomething'`, the build's `app_version`, `runtime: 'desktop'`, and `channel: 'beta'`. Repository, file, branch, commit, account-token, and error-message contents must never replace these labels.

The payload envelope contains the public ingestion `api_key`, an allowlisted `event`, a validated `distinct_id`, the allowed `properties`, and a generated timestamp. Properties also include `$geoip_disable: true` and `$process_person_profile`, which is true only for a signed-in username-sharing event. Only signed-in username-sharing events add `$set: { github_login: <login> }`. Anonymous events contain no profile-setting property.

No PostHog JavaScript SDK, autocapture, automatic page views, session replay, feature flags, remote configuration, surveys, log collector, or automatic performance/metric collector is loaded. Manual payloads contain no URL, referrer, session, or browser metadata. There are no hidden identification or alias events beyond the explicit application events above.

## Owner dashboard

The [private owner dashboard](https://eu.posthog.com/project/304237/dashboard/1032868) requires owner access. It is part of a shared PostHog project: every dashboard query must filter `app_name = 'GitSomething'` so other applications' events do not enter these counts. Event names and the allowlist provide additional boundaries; do not substitute a repository or username for this application filter.

The desktop app does not contain an embedded dashboard, fake live counts, or an administrative API key. Only a user who explicitly selects username sharing and then signs in can appear under a GitHub username.

## Verification status

All eight saved dashboard queries execute successfully and currently contain no GitSomething usage. The integration passes 90 unit tests, including 17 analytics tests, and nine production-bundle browser checks. The browser harness uses an explicit Tauri-origin/account fixture and intercepts every analytics request locally; it verifies real request payloads, consent, identity restoration, cookies/referrers, and desktop/320px preferences without sending synthetic usage to PostHog. Rust configuration passes `cargo check --locked`.

These checks establish application behavior and dashboard configuration. Live ingestion from an installed production build has not been exercised. A newly built application is required; the existing beta release remains unchanged. User counts measure participating identities: devices without names cannot be deduplicated against later named choices without linking their histories, which this implementation deliberately avoids.
