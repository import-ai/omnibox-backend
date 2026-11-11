-- Test warehouse only. Do not replace the source with production as part of QA.
-- Cohorts use event time (Asia/Shanghai), never ingestion time.
-- Re-query historical days after delayed deliveries; do not increment a daily snapshot.
WITH normalized AS (
  SELECT
    toString(user_id) AS actor,
    event_name,
    JSONExtractString(toJSONString(event_props), 'platform') AS platform,
    JSONExtractString(toJSONString(event_props), 'event_id') AS event_id,
    JSONExtractString(toJSONString(event_props), 'action_id') AS action_id,
    JSONExtractString(toJSONString(event_props), 'scope') AS scope,
    JSONExtractString(toJSONString(event_props), 'status') AS status,
    JSONExtractString(toJSONString(event_props), 'result_source') AS result_source,
    JSONExtractString(toJSONString(event_props), 'action_type') AS action_type,
    JSONExtractFloat(toJSONString(event_props), 'duration_ms') AS duration_ms,
    parseDateTime64BestEffortOrNull(JSONExtractString(toJSONString(event_props), 'occurred_at'), 3, 'UTC') AS occurred_at,
    parseDateTime64BestEffortOrNull(JSONExtractString(toJSONString(event_props), 'action_started_at'), 3, 'UTC') AS initiated_at,
    JSONExtractString(toJSONString(event_props), 'business_date') AS segment_day,
    timestamp AS received_at
  FROM pr_omnibox.trace_events
  WHERE event_name IN ('ui_exposure', 'active_duration', 'input_activation', 'editor_input', 'core_action_start', 'core_action_result', 'onboarding_recording_result')
    AND JSONExtractUInt(toJSONString(event_props), 'schema_version') = 1
    AND notEmpty(ifNull(toString(user_id), ''))
), deduplicated AS (
  SELECT * EXCEPT(received_at, delivery_rank) FROM (
    SELECT *, row_number() OVER (PARTITION BY actor, platform, event_id ORDER BY received_at DESC) AS delivery_rank
    FROM normalized WHERE notEmpty(event_id) AND platform IN ('web', 'ios', 'android')
  ) WHERE delivery_rank = 1
), facts AS (
  SELECT *,
    multiIf(event_name IN ('core_action_start', 'core_action_result'), toDate(initiated_at, 'Asia/Shanghai'),
      event_name = 'active_duration', toDateOrNull(segment_day), toDate(occurred_at, 'Asia/Shanghai')) AS day,
    event_name IN ('core_action_start', 'core_action_result') AND notEmpty(action_id) AS is_core,
    event_name = 'core_action_result' AND status = 'success'
      AND (result_source = 'server' OR (action_type = 'resource_read' AND result_source = 'visible_reading')) AS is_success
  FROM deduplicated
)
SELECT
  day, platform,
  uniqExactIf(actor, event_name != 'onboarding_recording_result') AS dau,
  uniqExactIf(actor, is_core) AS core_dau,
  uniqExactIf(actor, is_success) AS successful_core_users,
  successful_core_users / nullIf(dau, 0) AS successful_core_user_rate,
  sumIf(duration_ms, event_name = 'active_duration' AND scope = 'global') AS foreground_duration_ms
FROM facts
WHERE day IS NOT NULL
GROUP BY day, platform
ORDER BY day DESC, platform;
-- For a combined cross-platform DAU, remove platform from SELECT/GROUP BY.
-- Never sum per-platform unique-user counts or derive DAU from receipt timestamps.
