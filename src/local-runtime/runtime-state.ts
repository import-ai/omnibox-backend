export const EXECUTION_STATUSES = [
  'queued',
  'accepted',
  'awaiting_approval',
  'approved',
  'running',
  'cancel_requested',
  'succeeded',
  'failed',
  'denied',
  'canceled',
  'timed_out',
  'unknown',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export const TERMINAL = new Set<ExecutionStatus>([
  'succeeded',
  'failed',
  'denied',
  'canceled',
  'timed_out',
  'unknown',
]);

export function canReport(
  current: ExecutionStatus,
  next: ExecutionStatus,
  approved: boolean,
): boolean {
  if (TERMINAL.has(current)) return false;
  if (next === 'unknown' || next === 'canceled') return true;
  if (next === 'denied')
    return !['running', 'cancel_requested'].includes(current);
  if (current === 'cancel_requested')
    return ['succeeded', 'failed', 'timed_out'].includes(next);
  if (next === 'accepted') return current === 'queued';
  if (next === 'awaiting_approval')
    return ['queued', 'accepted', 'approved'].includes(current);
  if (next === 'running')
    return ['queued', 'accepted', 'approved'].includes(current) && approved;
  return (
    current === 'running' && ['succeeded', 'failed', 'timed_out'].includes(next)
  );
}
