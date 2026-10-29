const MENTION_SHORTCODE = /\[@\s+([^\]]*)\]/g;
const ATTR = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
const HELD_CODE = /\0CODE(\d+)\0/g;

export function mentionDisplayName(member: {
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
  userId: string;
}) {
  const identity = member.username || member.email || member.userId;
  const nickname = member.nickname?.trim() ?? '';
  if (nickname && identity && nickname !== identity) {
    return `${nickname}（${identity}）`;
  }
  return nickname || identity;
}

function attribute(attributes: string, name: string) {
  ATTR.lastIndex = 0;
  let match = ATTR.exec(attributes);
  while (match) {
    if (match[1] === name) {
      return match[2] ?? match[3];
    }
    match = ATTR.exec(attributes);
  }
  return undefined;
}

function quoted(value: string) {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return null;
}

function withLabel(shortcode: string, attributes: string, label: string) {
  const id = attribute(attributes, 'id');
  const labelQuote = quoted(label);
  const idQuote = id ? quoted(id) : null;
  if (!labelQuote) {
    return shortcode;
  }
  if (id && idQuote) {
    return `[@ id=${idQuote} label=${labelQuote}]`;
  }
  const trimmed = attributes.trim();
  return trimmed
    ? `[@ ${trimmed} label=${labelQuote}]`
    : `[@ label=${labelQuote}]`;
}

function holdCodeBlocks(markdown: string) {
  const slots: string[] = [];
  const hold = (block: string) => {
    slots.push(block);
    return `\0CODE${slots.length - 1}\0`;
  };
  const withoutFences = markdown.replace(
    /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm,
    hold,
  );
  const text = withoutFences.replace(/(`+)[\s\S]*?\1/g, hold);
  return { text, slots };
}

function restoreCodeBlocks(text: string, slots: string[]) {
  return text.replace(HELD_CODE, (_match, index) => slots[Number(index)] ?? '');
}

// Keeps the last shown name in the stored shortcode. Absent ids are left
// unchanged so a member who already left does not lose that label.
export function rewriteMentionLabels(
  markdown: string,
  namesById: Record<string, string>,
) {
  if (!markdown || Object.keys(namesById).length === 0) {
    return markdown;
  }
  const { text, slots } = holdCodeBlocks(markdown);
  const rewritten = text.replace(
    MENTION_SHORTCODE,
    (shortcode, attributes: string) => {
      const id = attribute(attributes, 'id');
      const latest = id ? namesById[id] : undefined;
      if (!latest || attribute(attributes, 'label') === latest) {
        return shortcode;
      }
      return withLabel(shortcode, attributes, latest);
    },
  );
  return restoreCodeBlocks(rewritten, slots);
}

export function referencedMentionIds(markdown: string): string[] {
  const { text } = holdCodeBlocks(markdown || '');
  const ids = new Set<string>();
  for (const match of text.matchAll(MENTION_SHORTCODE)) {
    const type = attribute(match[1], 'type');
    const id = attribute(match[1], 'id');
    if (id && (!type || type === 'user')) ids.add(id);
  }
  return [...ids];
}

export function referencedMentionNames(
  content: string,
  names: Record<string, string>,
) {
  return Object.fromEntries(
    referencedMentionIds(content)
      .filter((id) => names[id])
      .map((id) => [id, names[id]]),
  );
}
