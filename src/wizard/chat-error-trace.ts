export type ChatErrorGroup =
  | 'network'
  | 'auth'
  | 'request'
  | 'service'
  | 'quota'
  | 'device'
  | 'unknown';

// Keep the category names in sync with the Web chat error classifier so that
// client and server fallback events can be aggregated together.
const CATEGORY_BY_CODE: Record<string, string> = {
  not_authorized: 'unauthorized',
  invalid_client_request_id: 'invalid_request',
  invalid_query: 'invalid_request',
  chat_not_allowed: 'share_unavailable',
  message_id_not_set: 'service_unavailable',
  conversation_busy: 'busy',
  pending_interrupt: 'pending_decision',
  decision_not_applied: 'decision_not_applied',
  interrupt_already_decided: 'already_decided',
  wizard_request_failed: 'request_failed',
  response_body_not_readable: 'response_unreadable',
  token_expired: 'unauthorized',
  invalid_token: 'unauthorized',
  no_token: 'unauthorized',
  unauthorized: 'unauthorized',
  conversation_access_denied: 'forbidden',
  user_not_owner_or_admin: 'forbidden',
  not_a_member: 'forbidden',
  resource_read_only: 'forbidden',
  conversation_not_found: 'not_found',
  message_not_found: 'not_found',
  resource_not_found: 'not_found',
  file_not_found: 'not_found',
  namespace_not_found: 'namespace_not_found',
  workspace_not_found: 'namespace_not_found',
  root_resource_not_found: 'private_root_unavailable',
  parent_conversation_mismatch: 'invalid_request',
  invalid_history: 'invalid_request',
  missing_required_fields: 'invalid_request',
  missing_file: 'invalid_request',
  file_required: 'invalid_request',
  file_empty: 'invalid_request',
  local_runtime_not_found: 'execution_unavailable',
  local_runtime_unauthorized: 'unauthorized',
  local_runtime_revoked: 'device_revoked',
  local_runtime_changed: 'execution_changed',
  local_runtime_offline: 'device_offline',
  local_runtime_expired: 'approval_expired',
  local_runtime_sequence: 'tool_failed',
  local_runtime_state: 'tool_failed',
  upload_failed: 'upload_failed',
  file_too_large: 'file_too_large',
  file_type_not_supported: 'unsupported_file',
  conversation_attachment_unavailable: 'attachment_unavailable',
  attachment_not_found: 'attachment_unavailable',
  storage_quota_exceeded: 'storage_full',
  insufficient_credits: 'credits_exhausted',
  share_not_found: 'share_unavailable',
  share_chat_not_allowed: 'share_unavailable',
  stream_connection_failed: 'connection_interrupted',
  stream_read_failed: 'connection_interrupted',
  stream_interrupted: 'stream_interrupted',
  stream_not_found: 'stream_interrupted',
  stream_send_failed: 'stream_send_failed',
  err_network: 'connection_interrupted',
  econnreset: 'connection_interrupted',
  econnaborted: 'timeout',
  etimedout: 'timeout',
  content_review_rejected: 'content_review',
  output_content_review_rejected: 'output_content_review',
  upstream_bad_request: 'upstream_error',
  upstream_unauthorized: 'upstream_error',
  upstream_forbidden: 'upstream_error',
  upstream_not_found: 'upstream_error',
  upstream_conflict: 'upstream_error',
  upstream_unprocessable: 'upstream_error',
  upstream_rate_limited: 'upstream_error',
  upstream_server_error: 'upstream_error',
  upstream_timeout: 'upstream_error',
  upstream_connection_failed: 'upstream_error',
  upstream_api_error: 'upstream_error',
  internal_error: 'upstream_error',
};

const GROUP_BY_CATEGORY: Record<string, ChatErrorGroup> = {
  stream_interrupted: 'network',
  stream_send_failed: 'network',
  content_review: 'request',
  output_content_review: 'request',
  upstream_error: 'service',
  unknown: 'unknown',
  request_failed: 'service',
  connection_interrupted: 'network',
  response_unreadable: 'service',
  timeout: 'network',
  unauthorized: 'auth',
  forbidden: 'auth',
  not_found: 'request',
  invalid_request: 'request',
  rate_limited: 'quota',
  service_unavailable: 'service',
  busy: 'service',
  pending_decision: 'service',
  decision_not_applied: 'service',
  already_decided: 'service',
  upload_failed: 'request',
  file_too_large: 'request',
  unsupported_file: 'request',
  attachment_unavailable: 'request',
  storage_full: 'quota',
  credits_exhausted: 'quota',
  namespace_not_found: 'request',
  private_root_unavailable: 'request',
  tool_failed: 'service',
  device_offline: 'device',
  device_revoked: 'device',
  approval_expired: 'device',
  execution_changed: 'device',
  execution_unavailable: 'device',
  share_unavailable: 'request',
};

export function chatErrorCategory(code?: string, status?: number): string {
  const normalized = code?.trim().toLowerCase();
  if (normalized && CATEGORY_BY_CODE[normalized]) {
    return CATEGORY_BY_CODE[normalized];
  }
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 413) return 'file_too_large';
  if (status === 415) return 'unsupported_file';
  if (status === 429) return 'rate_limited';
  if (status && status >= 500) return 'service_unavailable';
  if (status && status >= 400) return 'invalid_request';
  return 'unknown';
}

export function chatErrorGroup(category: string): ChatErrorGroup {
  return GROUP_BY_CATEGORY[category] ?? 'unknown';
}
