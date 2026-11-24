import type { MessageAttrs } from './entities/message.entity';

export function publicMessageAttrs(attrs: MessageAttrs): MessageAttrs {
  const { context, ...publicAttrs } = attrs;
  // Only the presentation marker is public; call telemetry and checkpoints are not.
  const phase = context?.answer_phase;
  if (phase === 'process' || phase === 'answer') {
    publicAttrs.answer_phase = phase;
  }
  return publicAttrs;
}
