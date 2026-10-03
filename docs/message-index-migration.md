# Message index migration

This is a manual, namespace-scoped operation. It never changes messages or resource chunks.
Old assistants without `attrs.turn_completed` are skipped; EOS success is not completion evidence.

1. Deploy the new Backend, Backend Pro core, Wizard and shared types. Drain old instances.
2. Disable `upsert_message_index` on **every** worker using the existing `OBW_TASK_FUNCTIONS` setting,
   restart those workers and wait until no running message index tasks remain. Keep it disabled
   throughout rebuild and retries. Chat persists new tasks normally. Also stop legacy direct backfills.
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
   Restore worker functions only after failures are resolved. Pending tasks revalidate eligibility
   against Backend before writing, so legacy intermediate-message tasks cannot repopulate the index.

During rebuilding, search may be incomplete. Automatic recall must degrade without blocking chat.
For rollback, disable memory/recall and retain the new finality guard and eligibility-aware consumers;
do not restore old per-assistant writers against the rebuilt index. No startup migration is installed.
