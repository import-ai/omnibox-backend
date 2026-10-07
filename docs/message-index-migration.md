# Message index migration

This is a manual, namespace-scoped operation. It never changes messages or resource chunks.
Both old and new assistants qualify when they have a user, non-empty content, success status,
no tool calls or approval interrupts, and either no active children or an ordinary user child.
Approval decisions do not count as a new user query. Relations are scoped to the same conversation;
soft-deleted messages are ignored. Each branch is evaluated independently. Live indexing still waits
for a successful `done`; migration accepts successful historical answer boundaries without that event.
No completion attribute or schema migration is required.

1. Deploy the new Backend, Backend Pro core, Wizard and shared types. Drain old instances.
2. Record the replica count and stop **every regular Wizard worker** (`omnibox-wizard-worker`).
   Wait for the workers to exit and confirm no running message index tasks remain. Keep the Wizard
   API available for vector operations. Do not disable the function through `OBW_TASK_FUNCTIONS`:
   disabled functions are still polled and their tasks fail instead of remaining pending.
   Keep workers stopped throughout rebuild and retries; new chat tasks remain pending.
   Also stop legacy direct backfills.
3. Preview each namespace (use the internal Backend address, not the gateway):

```sh
python3 scripts/rebuild-message-index.py --backend "$BACKEND_URL" --namespace-id "$NAMESPACE_ID" --report preview.json
```

4. Apply with `--apply --report applied.json`. The service rejects running tasks, clears only
   `type=message` in that namespace, verifies deletion completion and rebuilds eligible messages.
   Preview `synced` IDs mean eligible, not already written. Reports contain IDs only.
5. Retry failures with `--apply --retry-failed applied.json --report retried.json`.
   This mode does not clear the namespace. Preserve each report. A transport interruption requires
   keeping consumption paused and rerunning the full apply (idempotent); do not assume success.
6. Check successful/failed/skipped counts and sample searches; verify resource chunks are unchanged.
   Restore the saved worker replica count only after failures are resolved. Pending tasks revalidate eligibility
   against Backend before writing, so legacy intermediate-message tasks cannot repopulate the index.

During rebuilding, search may be incomplete. Automatic recall must degrade without blocking chat.
For rollback, disable memory/recall and retain the new finality guard and eligibility-aware consumers;
do not restore old per-assistant writers against the rebuilt index. No startup migration is installed.

For all active namespaces, POST `/internal/api/v1/rebuild_all_message_indexes` with
`{"apply":false}` to preview and `{"apply":true}` to rebuild. An optional `namespace_ids`
array restricts the operation. Save `namespaces` and `errors` from the response.

Deploy Wizard Pro's parent-chain memory reader before Backend Pro stops writing the old completion
attribute. Then deploy Backend and Backend Pro with matching core references, drain old instances,
and rebuild with the regular Wizard worker stopped. Historical rebuilding never creates memory tasks.

For the internal history-search response upgrade, deploy Wizard Pro first (it accepts both
legacy arrays and the new `{items, total}` response), then Backend and Backend Pro core.
The public message-search response is unchanged. `total` counts eligible hits in the bounded
search candidate set, not every matching vector in the database.
