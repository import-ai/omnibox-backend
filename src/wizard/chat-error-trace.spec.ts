import { chatErrorCategory, chatErrorGroup } from './chat-error-trace';

describe('shared chat error taxonomy', () => {
  it.each([
    ['stream_interrupted', 'stream_interrupted', 'network'],
    ['stream_send_failed', 'stream_send_failed', 'network'],
    ['content_review_rejected', 'content_review', 'request'],
    ['output_content_review_rejected', 'output_content_review', 'request'],
    ['upstream_timeout', 'upstream_error', 'service'],
    ['upstream_connection_failed', 'upstream_error', 'service'],
    ['upstream_rate_limited', 'upstream_error', 'service'],
    ['internal_error', 'upstream_error', 'service'],
  ])('maps %s consistently with Web and App', (code, category, group) => {
    expect(chatErrorCategory(code)).toBe(category);
    expect(chatErrorGroup(category)).toBe(group);
  });
  it('keeps status fallback for otherwise unknown HTTP errors', () => {
    expect(chatErrorCategory(undefined, 504)).toBe('timeout');
    expect(chatErrorCategory('UPSTREAM_TIMEOUT', 504)).toBe('upstream_error');
  });
});
