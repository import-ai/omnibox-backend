import type { TraceEventDto } from 'omniboxd/trace/dto/trace-event.dto';
const NAMES = new Set([
  'ui_exposure',
  'active_duration',
  'input_activation',
  'editor_input',
  'core_action_start',
  'core_action_result',
  'onboarding_recording_result',
]);
const ACTIONS = new Set([
  'resource_add',
  'resource_read',
  'resource_edit',
  'ai_conversation',
  'annotation_comment',
  'document_comment',
]);
const FIELDS = new Set(
  'schema_version event_id occurred_at finger scope target page_key page_view_id exposure_id activation_id segment_id started_at ended_at duration_ms business_date reason action_id action_type action_started_at origin_platform status result_source resource_id resource_type entry source enabled location space_type app_id surface origin page scene state failure_reason attempt_id has_input conversation_id'.split(
    ' ',
  ),
);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Existing event families remain unchanged; non-button traffic has an explicit privacy/schema boundary. */
export function clientBehaviorEvent(
  event: TraceEventDto,
  now = Date.now(),
): TraceEventDto | undefined {
  if (!NAMES.has(event.name)) return event;
  const p = event.props;
  const occurred = Date.parse(p.occurred_at);
  if (
    p.schema_version !== 1 ||
    !UUID.test(p.event_id) ||
    !Number.isFinite(occurred) ||
    occurred > now + 60_000 ||
    occurred < now - 7 * 86_400_000
  )
    return;
  if (event.name.startsWith('core_action_')) {
    const started = Date.parse(p.action_started_at);
    if (
      !UUID.test(p.action_id) ||
      !ACTIONS.has(p.action_type) ||
      !Number.isFinite(started) ||
      started > occurred + 60_000 ||
      started < now - 7 * 86_400_000
    )
      return;
  }
  // Persisted business outcomes are emitted only by trusted server producers.
  if (
    event.name === 'core_action_result' &&
    (p.action_type !== 'resource_read' ||
      p.result_source !== 'visible_reading' ||
      p.status !== 'success')
  )
    return;
  if (event.name === 'active_duration') {
    const start = Date.parse(p.started_at),
      end = Date.parse(p.ended_at);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      p.duration_ms < 0 ||
      !Number.isFinite(p.duration_ms) ||
      Math.abs(end - start - p.duration_ms) > 1 ||
      p.duration_ms > 86_400_000
    )
      return;
    if (
      new Date(start + 28_800_000).toISOString().slice(0, 10) !==
      p.business_date
    )
      return;
  }
  return {
    ...event,
    props: Object.fromEntries(
      Object.entries(p).filter(
        ([key, value]) =>
          FIELDS.has(key) &&
          (typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value)) ||
            (typeof value === 'string' && value.length <= 256)),
      ),
    ),
  };
}
