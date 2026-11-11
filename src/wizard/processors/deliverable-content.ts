import { Task } from 'omniboxd/tasks/tasks.entity';

/** Reject title-only web results without imposing a minimum body length. */
export function hasDeliverableContent(
  task: Pick<Task, 'function' | 'output'>,
): boolean {
  const markdown = task.output?.markdown;
  if (typeof markdown !== 'string' || !markdown.trim()) return false;
  if (task.function !== 'collect') return true;
  if (task.output?.body_delivered === false) return false;
  const body = markdown.trim();
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title =
    typeof task.output?.title === 'string' ? task.output.title.trim() : '';
  if (lines.length === 1) {
    const plain = lines[0]
      .replace(/^#{1,6}\s+/, '')
      .replace(/\s+#+$/, '')
      .trim();
    if (/^#{1,6}\s+/.test(lines[0]) || (title && plain === title)) return false;
  }
  if (lines.length === 2 && /^(?:=+|-+)$/.test(lines[1])) return false;
  return true;
}
