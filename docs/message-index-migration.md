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
3. Preview a namespace through the internal Backend address, not the gateway. These commands
   use `curl` and `jq`; set `BACKEND_URL` and `NAMESPACE_ID` first.

```sh
jq -n --arg namespace_id "$NAMESPACE_ID" '{namespace_id: $namespace_id, apply: false}' |
  curl --fail-with-body --silent --show-error --max-time 3600 \
    -H 'Content-Type: application/json' --data-binary @- \
    "$BACKEND_URL/internal/api/v1/rebuild_message_index" --output preview.json
```

4. Apply the rebuild. The service rejects running tasks, clears only `type=message` in that
   namespace, verifies deletion completion and rebuilds eligible messages. Preview `synced`
   IDs mean eligible, not already written. Reports contain IDs only.

```sh
jq -n --arg namespace_id "$NAMESPACE_ID" '{namespace_id: $namespace_id, apply: true}' |
  curl --fail-with-body --silent --show-error --max-time 3600 \
    -H 'Content-Type: application/json' --data-binary @- \
    "$BACKEND_URL/internal/api/v1/rebuild_message_index" --output applied.json
jq -e '.failed | length == 0' applied.json
```

5. Retry only failed messages using the namespace recorded in the saved report:

```sh
jq -e 'select((.namespace_id | type) == "string" and (.failed | type) == "array") |
  {namespace_id, apply: true, message_ids: .failed}' applied.json |
  curl --fail-with-body --silent --show-error --max-time 3600 \
    -H 'Content-Type: application/json' --data-binary @- \
    "$BACKEND_URL/internal/api/v1/rebuild_message_index" --output retried.json
jq -e '.failed | length == 0' retried.json
```

   This mode does not clear the namespace. Preserve each report; for another retry, use the
   latest report as input and a new output filename. A transport interruption requires keeping
   consumption paused and rerunning the full apply (idempotent); do not assume success.
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
