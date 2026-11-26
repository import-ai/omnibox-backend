// The database writer can lag behind the model. Combine only text that has
// already arrived in one read, without delaying the next visible fragment.
export function coalesceTextDeltas(frames: string[]): string[] {
  if (frames.length < 2) return frames;
  const result: string[] = [];
  let field: string | undefined;
  let text = '';
  const flush = () => {
    if (field) {
      result.push(
        JSON.stringify({ response_type: 'delta', message: { [field]: text } }),
      );
      field = undefined;
      text = '';
    }
  };
  for (const frame of frames) {
    const chunk = JSON.parse(frame);
    const entries = Object.entries(chunk.message ?? {}).filter(
      ([, value]) => value != null,
    );
    const [key, value] = entries[0] ?? [];
    if (
      chunk.response_type === 'delta' &&
      Object.keys(chunk).every(
        (k) => k === 'message' || k === 'response_type' || chunk[k] == null,
      ) &&
      entries.length === 1 &&
      (key === 'content' || key === 'reasoning_content') &&
      typeof value === 'string'
    ) {
      if (key !== field) flush();
      field = key;
      text += value;
    } else {
      flush();
      result.push(frame);
    }
  }
  flush();
  return result;
}
