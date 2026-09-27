# Local runtime

Authenticated users register their desktop devices and review executions through
`/api/v1/local-devices` and `/api/v1/local-executions`. Device polling and event
reporting additionally require `X-Device-Key`; only its SHA-256 digest is stored.
Browser clients can rename/revoke devices and approve/reject/cancel executions,
but cannot update a device's local policy or submit results without that key.

Wizard uses `/internal/api/v1/namespaces/:namespaceId/local-runtime`. These routes
follow the existing internal `X-User-ID` contract and must remain network-private.
Execution creation verifies personal conversation ownership and namespace access.
Shared conversations cannot create local executions.

A poll waits up to 25 seconds. One batched database check per backend instance
wakes waiting polls. A device-row transaction lock serializes dispatch across
instances. Unacknowledged deliveries retry after 15 seconds with the same
execution ID; they never authorize a second process. The desktop durably records
IDs before starting and returns prior results for duplicate deliveries.

Approvals expire after ten minutes and bind immutable execution parameters.
Policy is rechecked on the computer; server-side policy is only its latest mirror.
Cancel requests remain pending until the device reports a result. Disconnection
alone never means failure, successful cancellation, or permission to retry.

Execution events use monotonically increasing per-execution sequence numbers.
The results endpoint returns up to 100 events per page, using `after`; history
uses `offset`. Pagination does not truncate stored output. No output summarization,
redaction, filesystem diff capture or rollback is implemented.

Run the isolated PostgreSQL integration check and stream cancellation regressions:

```sh
pnpm exec jest src/local-runtime/local-runtime.spec.ts src/wizard/stream.service.spec.ts --runInBand
```

The test starts its own PostgreSQL container and never uses an application database.
