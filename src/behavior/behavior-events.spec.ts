import { clientBehaviorEvent } from './behavior-events';
const now = Date.parse('2026-11-11T00:00:00Z');
const id = 'c2b32a35-0b7d-43bb-b0fd-bd75aed99159';
const common = {
  schema_version: 1,
  event_id: id,
  occurred_at: new Date(now).toISOString(),
};
it('rejects client-forged persisted success, preserving only visible-reading success', () => {
  const props = {
    ...common,
    action_id: id,
    action_started_at: common.occurred_at,
    action_type: 'resource_add',
    status: 'success',
    result_source: 'server',
  };
  expect(
    clientBehaviorEvent({ name: 'core_action_result', props }, now),
  ).toBeUndefined();
  expect(
    clientBehaviorEvent(
      {
        name: 'core_action_result',
        props: {
          ...props,
          action_type: 'resource_read',
          result_source: 'visible_reading',
        },
      },
      now,
    ),
  ).toBeDefined();
});
it('accepts a midnight slice by its start day and drops accidental private dimensions', () => {
  const event = {
    name: 'active_duration',
    props: {
      ...common,
      started_at: '2026-11-10T15:59:59.000Z',
      ended_at: '2026-11-10T16:00:00.000Z',
      duration_ms: 1000,
      business_date: '2026-11-10',
      content: 'private',
      url: 'private',
    },
  };
  expect(clientBehaviorEvent(event, now)?.props.content).toBeUndefined();
  expect(clientBehaviorEvent(event, now)?.props.business_date).toBe(
    '2026-11-10',
  );
  expect(
    clientBehaviorEvent(
      { ...event, props: { ...event.props, duration_ms: 9000 } },
      now,
    ),
  ).toBeUndefined();
  expect(
    clientBehaviorEvent(
      { ...event, props: { ...event.props, business_date: '2026-11-11' } },
      now,
    ),
  ).toBeUndefined();
});
it('leaves pre-existing button/auth/chat telemetry unchanged', () => {
  const event = { name: 'button_click', props: { module: 'resources' } };
  expect(clientBehaviorEvent(event, now)).toBe(event);
});
