---
date: 2026-05-08
topic: usability-refinements
focus: marginal usability refinements; core functionality is good
mode: repo-grounded
---

# Ideation: Charlie Tracker Usability Refinements

## Grounding Context

**Project:** React 18 + Vite PWA, dark theme, plain CSS (~41KB single `App.css`), Supabase backend (Auth/Realtime/Storage), custom service worker (`public/sw.js`) with VAPID push, 2-user invite-only shared inbox for school communications. Tabs: messages, events, calendar, documents, settings, notes.

**Recurring bug class:** Three of the last five commits (`a344ffd`, `0178d1a`, `bbf5995`, `aded93a`) fixed regressions in `NoteModal`/calendar — modal-state and overflow bugs are a recurring class.

**Observed gaps (from source reading):**
- `App.jsx` holds ~30+ `useState` calls; filters (`statusFilter`, `sourceFilter`, `actionFilter`, `searchQuery`, `eventsFilter`, `eventsTagFilter`, `categoryFilter`) are not URL-persisted; page resets to 1 on every filter change.
- `NoteModal.jsx`, `ActionModal.jsx`, `EventModal.jsx` each implement backdrop-click-dismiss with no ESC, no focus trap, no dirty-state guard, no return-focus-to-trigger.
- `MobileNav.jsx` uses bare emoji icons (💬📅🗓️📄⚙️) with no aria-labels and no ESC handler; `MobileNav.css` sets `transition: left 0.3s ease` with no `prefers-reduced-motion` override.
- `NotificationBell.jsx` has 20-item dropdown, "Dismiss all", click-outside; no grouping, no undo, no badge animation on new arrival.
- `CalendarView.jsx` is Monday-first with multi-day events; `goToday()` exists; double-tap detection via `lastTapTime`/`lastTapDate`; no keyboard arrow nav, no swipe between months.
- Custom SW has `push` and `notificationclick` handlers but no notification action buttons; no service-worker update toast.
- `toasts` state already exists in `App.jsx` line 176.
- No optimistic UI for read-state toggling, no `prefers-reduced-motion` compliance, no `viewport-fit=cover` / safe-area-inset handling, no tab-title unread count.

**Past learnings (from `docs/solutions/`):** No prior frontend learnings exist. Custom SW uses Workbox `generateSW` strategy with `workbox.importScripts: ['/push-sw.js']` to inject push/notificationclick handlers into the generated SW (`docs/solutions/best-practices/push-notifications-workbox-import-scripts-2026-05-12.md`); preserve when adding update toast.

**External patterns (from web research):** Radix/shadcn Dialog primitives ship with focus traps + ESC built in. `nuqs` is the emergent React standard for URL filter state. Mark-as-unread as snooze proxy (Linear, Notion). Optimistic UI drops perceived latency to ~0ms. Smashing Mag notification UX (dot for new uncounted, numeric ≤99+, snooze 1h/tomorrow/custom). Auto-reload on SW update is anti-pattern; toast with reload button is the canonical move. WCAG 2.1 SC 2.3.3 reduced-motion; Apple HIG safe-area.

**Tactical scope detected:** "marginal" + "usability" → meeting-test floor waived. Polish-tier wins are in scope.

## Ranked Ideas

### 1. Shared `<Modal>` primitive (focus trap + ESC + dirty-state guard + return focus)
**Description:** Extract a single Modal component owning backdrop click, ESC-to-close, focus trap, body scroll lock, return-focus-to-trigger on close, and an `isDirty` confirmation prompt. Migrate `NoteModal`, `ActionModal`, `EventModal` to use it. Cmd/Ctrl+Enter to submit comes for free.
**Warrant:** `direct:` Three of the last five commits (`a344ffd`, `0178d1a`, `bbf5995`, `aded93a`) fixed bugs in NoteModal/calendar. `NoteModal.jsx` line 67 dismisses on backdrop click with no warn; `ActionModal.jsx` line 31 has the same pattern; neither responds to ESC. `external:` Radix Dialog and shadcn/ui Dialog ship this exact primitive.
**Rationale:** One primitive eliminates a recurring regression class across every existing modal, and turns "add a modal" from a 200-line copy-paste into a 20-line composition.
**Downsides:** Touches three files at once; risk of subtle behavior drift if the new dirty-state confirm interrupts flows users rely on.
**Confidence:** 90%
**Complexity:** Medium
**Status:** Unexplored

### 2. URL state for filters, active tab, and active item
**Description:** Lift filters, active tab, current page, and expanded message ID out of `useState` into URL search params via a `useUrlState` hook (or `nuqs`). Smallest first move: hand-rolled `history.replaceState` + `URLSearchParams` — no library required.
**Warrant:** `direct:` `App.jsx` lines 169–200 hold ~30+ `useState` calls; page resets to 1 on every filter change (line 487). PWA cold-start wipes filters. `external:` `nuqs` and TanStack Router search-param state are the React standard; Linear and Slack use URL state for filter persistence.
**Rationale:** Filtered views become bookmarkable, browser back/forward starts working, and the two users can paste links to each other — the actual collaborative use-case for a 2-user inbox. Push notifications can deep-link to a specific message.
**Downsides:** URL gets visually busy; need abbreviated keys to keep links readable. Some realtime resubscribe paths may need to read URL state too.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Unexplored

### 3. Optimistic read-state toggling
**Description:** Flip read-state in local React state immediately, fire-and-forget the `message_read_status` upsert, roll back with a toast on rejection. Realtime reconciles if the partner toggles concurrently.
**Warrant:** `direct:` Read-state toggling currently waits on the Supabase round-trip — visible latency on the most repeated interaction. `external:` Optimistic UI for inbox toggling (Gmail, Linear, Notion) is the canonical "perceived latency drops to zero" move.
**Rationale:** Read-toggling is the single most repeated interaction in any inbox; making it instantaneous makes the entire app feel fast.
**Downsides:** Two-user concurrent-toggle edge case needs graceful handling (no-op rather than error toast).
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 4. One-tap "Mark Actioned" from row + OS notification action buttons
**Description:** Two changes that together collapse the action workflow:
- **In-app:** Checkbox/checkmark icon next to each action item that marks it actioned with a single tap. The note field becomes optionally editable inline after the fact. `ActionModal` is preserved only when the user wants to add a note up-front (long-press / secondary affordance).
- **OS-level:** Add `actions: [{action: 'actioned', title: 'Done'}, {action: 'open', title: 'Open'}]` to the `showNotification` call; handle in the existing SW `notificationclick` listener.
**Warrant:** `direct:` Custom SW with `push` and `notificationclick` handlers is already wired. Action flow is open ActionModal → optionally type note → submit (3 steps for 1 intent). `external:` Web Push API `actions` array (MDN); Gmail/Slack/GitHub PWAs use this pattern.
**Rationale:** Reduces the dominant action workflow from 3 steps to 1 in-app, and to **0 app-opens** at the OS-level — the user can clear an action from the lock screen without launching the PWA.
**Downsides:** Note is the audit-trail signal; making it optional risks losing context. Mitigation: subtle "no note" indicator on actioned items. iOS Safari has partial support for notification actions.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 5. "Your turn" affordance — leveraging the 2-user structure
**Description:** Add a subtle "Your turn" pill (or partner-avatar bubble = ball-in-their-court) on items where the *other* user has read or last-touched the item but the current user hasn't actioned it. No assignment ceremony — just a passive cue derived from `message_read_status` + `actioned_by` history.
**Warrant:** `reasoned:` The 2-user constraint is a unique structural advantage; "whose turn" is inferrable from existing data without explicit assignment UI. `external:` Front and Missive lean on assignment; the 2-user case captures most of the value with zero ceremony. Chess-clock visual analogy.
**Rationale:** Eliminates the daily "did you handle this or should I?" friction without adding a feature surface. A unique daily-life win that no off-the-shelf inbox can match.
**Downsides:** Heuristic edge cases (one partner reads but explicitly punts) may produce wrong "your turn" cues. Mitigation: keep the pill subtle and dismissible per item.
**Confidence:** 70%
**Complexity:** Low–Medium
**Status:** Unexplored

### 6. Service-worker update toast ("Update available — reload")
**Description:** Wire `vite-plugin-pwa`'s `registerSW({ onNeedRefresh })` to a small toast with a "Reload" button that calls `updateSW(true)`. Reuses the existing `toasts` state in `App.jsx` line 176.
**Warrant:** `direct:` Custom SW already wired via `generateSW` + `workbox.importScripts: ['/push-sw.js']` (per `docs/solutions/best-practices/push-notifications-workbox-import-scripts-2026-05-12.md`). No update affordance exists today. `external:` Standard Workbox/`vite-plugin-pwa` pattern; auto-reloading on update is a known anti-pattern.
**Rationale:** Bug-fix commits (the recent NoteModal/calendar regressions) don't reach users until they happen to fully close the PWA. A toast closes that gap with the existing toast state.
**Downsides:** Adds one async listener at boot. Test against the existing `generateSW` + `importScripts` setup so it doesn't conflict with the custom `push`/`notificationclick` handlers in `public/push-sw.js`.
**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

### 7. Accessibility & polish floor bundle
**Description:** Four small changes that share the "single-PR floor-raising polish" shape:
- **`prefers-reduced-motion`:** one `@media` block in `App.css` setting all animation/transition durations to `0.01ms` when the OS pref is set; guard `scrollIntoView({ behavior: 'smooth' })` in `ChatDrawer`.
- **iOS safe-area-inset:** add `viewport-fit=cover` to the meta viewport; apply `padding-bottom: env(safe-area-inset-bottom)` to fixed elements (FAB, bottom of MobileNav).
- **MobileNav aria-labels:** wrap each emoji-icon item with `aria-label="Messages"` etc.; add an ESC keydown handler that calls the existing close.
- **Tab title unread count:** `document.title = unreadCount > 0 ? '(${unreadCount}) Charlie Tracker' : 'Charlie Tracker'` from the same selector that powers the in-app badge.
**Warrant:** `direct:` Each is a known gap in source: `MobileNav.jsx` lines 11–17 use bare emoji with no aria-labels; `MobileNav.css` line 20 sets `transition: left 0.3s ease` with no reduced-motion override; no `viewport-fit=cover` in `index.html`. `external:` WCAG 2.1 SC 2.3.3 (reduced motion); Apple HIG safe-area; Gmail/Slack/Linear all set tab-title count.
**Rationale:** Each is a 4-to-20-line change. None individually warrants discussion; bundled, they raise the app's accessibility/polish floor in one PR. Tab-title count doubles as a "free" notification channel that needs no permission.
**Downsides:** Heterogeneous changes in one PR can complicate review. Mitigation: each piece is independent, split if reviewers prefer.
**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Auto-save modal drafts to localStorage | Duplicates dirty-state guard in #1 with more complexity |
| 2 | Auto-categorise messages by sender domain | Ingestion change, not marginal usability polish |
| 3 | Cmd+K global command palette | Larger scope than "marginal"; good as a follow-up brainstorm |
| 4 | Notes captured inline on message rows | Bigger UX shift; would conflict with NoteModal flow |
| 5 | Calendar tab → viewmode toggle on Events | Reframing, not polish |
| 6 | Default to email-only source view | Speculative without volume telemetry; not grounded |
| 7 | Settings as gear icon, not tab | Pairs with bottom-tab-bar decision; defer until then |
| 8 | Bottom tab bar replacing hamburger drawer | Too large a UX shift for "marginal" |
| 9 | Newspaper above-the-fold pinned strip | Needs heuristic design discussion → brainstorm topic |
| 10 | Voicemail-style fade-to-archive (opacity) | Useful but speculative without inbox-volume signal |
| 11 | "Read it to me" Web Speech API | Feature, not polish |
| 12 | Sterile cockpit / quiet hours | Useful but better as an explicit brainstorm |
| 13 | I-PASS handoff stamp on actioned items | Subsumed by "Your turn" (#5) |
| 14 | Hanging-protocol filter presets | Cleaner once URL state lands (#2); revisit then |
| 15 | Subway-style countdown chip on events | Cheap; defer until a `formatRelativeTime` helper exists |
| 16 | Per-user default landing tab | Niche; revisit if more 2-user polish lands |
| 17 | EmptyState component | Genuine leverage but no acute pain; revisit when needed |
| 18 | Toast primitive with undo (5s window) | #1 + #4 cover destructive surfaces for now; revisit |
| 19 | `formatRelativeTime` helper | Quiet refactor; pair with #5 or #7 if either ships |
| 20 | Active-filter count chip + Clear all | Subsumed by #2 (URL state surfaces filters in URL bar) |
| 21 | CSS variable extension (--state-pending etc.) | Compounds with #3/#4 but not standalone shippable polish |
| 22 | Reframe unread badge as "needs attention" | Changes mental model; better as explicit brainstorm |
| 23 | Last-action breadcrumb in header | Speculative; no signal that returning-after-absence is daily pain |
| 24 | "What changed since you last looked" pill | Overlaps #3 + realtime UX work; revisit after #3 lands |
| 25 | Push permission deferred to first valuable moment | Real polish; cut only to keep top-7 cap |
| 26 | Colour-coded category strip on rows | Real polish; cut only to keep top-7 cap |
