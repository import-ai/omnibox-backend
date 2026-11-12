-- Restrict the test time window before interpreting missing or duplicate observations.
SELECT
  toDate(parseDateTime64BestEffortOrNull(JSONExtractString(toJSONString(event_props), 'occurred_at'), 3, 'UTC'), 'Asia/Shanghai') AS day,
  JSONExtractString(toJSONString(event_props), 'platform') AS platform,
  JSONExtractString(toJSONString(event_props), 'target') AS target,
  JSONExtractString(toJSONString(event_props), 'source') AS source,
  JSONExtractString(toJSONString(event_props), 'entry') AS entry,
  JSONExtractString(toJSONString(event_props), 'space_type') AS space_type,
  JSONExtractString(toJSONString(event_props), 'resource_type') AS resource_type,
  JSONExtractString(toJSONString(event_props), 'app_id') AS app_id,
  JSONExtractBool(toJSONString(event_props), 'enabled') AS enabled,
  uniqExact(JSONExtractString(toJSONString(event_props), 'event_id')) AS exposures
FROM pr_omnibox.trace_events
WHERE event_name = 'ui_exposure'
  AND JSONExtractUInt(toJSONString(event_props), 'schema_version') = 1
  AND parseDateTime64BestEffortOrNull(JSONExtractString(toJSONString(event_props), 'occurred_at'), 3, 'UTC') >= now64(3) - INTERVAL 7 DAY
GROUP BY day, platform, target, source, entry, space_type, resource_type, app_id, enabled
ORDER BY day DESC, platform, target, source, entry;
-- Disabled-but-visible entries are valid exposures, not successful actions.
-- No device fingerprint, user ID, resource ID, content, or arbitrary payload is displayed.
