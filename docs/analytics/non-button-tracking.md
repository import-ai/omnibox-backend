# Non-button behavior contract

The seven version-1 families are `ui_exposure`, `active_duration`, `input_activation`, `editor_input`, `core_action_start`, `core_action_result`, and `onboarding_recording_result`. Keep identifiers and snake_case property names stable across clients and the warehouse. The existing trace endpoint/Kafka pipeline remains the transport; do not send document text, comments, prompts, clipboard contents, file names, links, or credentials as dimensions.

## Ownership and success

- Clients own actual visibility, foreground time, input/focus signals, and visible reading strictly greater than 10,000 ms. Reading accumulation resets at Asia/Shanghai midnight. Folder listings are not document reading.
- An editor visit starts with `has_input=false`; first genuine input starts its core action, splits the dwell segment, and changes subsequent segments to `has_input=true`. Programmatic editor initialization does not count as input.
- Backend business writes own persisted outcomes. Synchronous document/folder creation, actual changed content/name commits, and persisted comments qualify; uploaded binaries awaiting parsing do not. Parse tasks retain action context in their durable payload. Terminal parse outcomes are reconciled after post-processing; retry descendants supersede their original attempts.
- AI success requires a normal DONE with a nonempty final assistant answer, no pending tool call/decision, no stop, and no failure. The action ID is retained on server-created messages; persisted answer timing supports reconciliation after process interruption. A paused decision is not success.
- Server action rows preserve authenticated user, origin platform, and original initiation time. Client-supplied persisted-result claims are discarded. A later success may promote a previously failed action; status-specific deterministic result IDs prevent dropping that correction as a retry.
- Automatic RSS work has no client action context and is excluded. Background completion never creates new-day activity. Recompute original-day cohorts after late delivery.

## Delivery, rollout, and limits

Clients use a separate bounded outbox (100 events, 24-hour expiry), stable event IDs, original ISO event times, and account/API-scoped retries. Storage/fingerprinting failures must not break product actions. Retried delivery must never retry a product write. Incremental duration segments split at Shanghai midnight and are summed once by event/segment identity; never sum cumulative snapshots.

Server action results remain durable until successful Kafka delivery. Replayed results and starts reuse identities. Kafka delivery is at-least-once, not exactly-once; queries must deduplicate. There remains a conservative business-commit-to-outcome handoff for synchronous writes and parse post-processing: a process failure at that boundary can leave a pending action rather than fabricate success. Check pending ledger rows during rollout; do not classify them as successful without business evidence.

Apply the migration before enabling clients. Include `BehaviorModule` and the migration in both Backend and Backend Pro; pin Pro's `core` to the exact delivered Backend commit. Disable collection independently using `VITE_NON_BUTTON_TRACKING_ENABLED=false`, `EXPO_PUBLIC_NON_BUTTON_TRACKING_ENABLED=false`, or `OBB_NON_BUTTON_TRACKING_ENABLED=false`. Client flags are build-time; the server flag is runtime configuration. Do not deploy, merge, or silently switch the production data source during development.

The H5 detail reader opts into the native bridge explicitly. Native owns global/resource clocks, reading qualification, account scope, platform, privacy, and delivery. H5 supplies editor/comment signals without a second Web activity stream. Old hosts without opt-in remain disabled. Only the configured H5 origin and current resource/account are accepted.

## Coverage boundaries

Web covers actual root/child creation items in private/teamspace menus, home upload/link entries, resource reading/editing, AI composer and conversation/Copilot dwell, annotation-panel visibility, document-comment focus, settings/applications, and each existing binding dialog. App covers home bottom entries, the more drawer, private/teamspace resource drawers, native long-press menus, clipboard clipping, native/H5 readers/editors, AI composer/conversation, onboarding scenes/pages and recording outcomes, settings/applications, and existing binding surfaces.

Do not invent exposures for hidden or nonexistent controls. The App baseline has four supported assistant bindings (`wechat_oa_bot`, `wechat_bot`, `wechat_clawbot`, `telegram_bot`), not QQ; native detail does not expose native comment controls. Native H5 comments are instrumented when that existing fallback is used. Web has no App-style multi-scene recording onboarding. Adding new QQ/native-comment/onboarding product flows is a separate requirement, not telemetry work.

## Acceptance

Use `non-button-daily.sql` against the test warehouse only. Validate build/platform and a fixed test-start window before calling missing events a defect. Cross-platform totals require another distinct-user aggregation, not addition of platform totals. Anonymous actors are excluded from authenticated DAU and core rates.

Verify real flows: actual menu-item visibility/reopening, background/foreground, masked resources, hidden Copilot, StrictMode/remount cleanup, 10,000 versus 10,001 ms, first input versus mount, unchanged/failed/successful saves, binary upload versus successful/failed parse, offline save/restart/account switch, AI final/error/stopped/paused decisions, persisted annotation/document comments, every existing assistant binding, and denied/empty/network/invalid/failed onboarding recordings. Verify 23:59 initiation with 00:01 completion, next-day reading reset, duplicate delivery, and late replay without next-day false activity.

Unit/type/build checks are not device, visual, database-migration, or end-to-end warehouse acceptance. Record these separately and keep the Roadmap in progress until their required checks have run.
