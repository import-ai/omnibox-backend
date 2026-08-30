const INTERNAL_RESOURCE_LINK = /(?<!!)\[([^\]\r\n]+)\]\(#[0-9A-Za-z]{15,16}\)/g;
const LINKED_CITATION = /[ \t]*\[\[\d+\]\]\(C\d+-[^)\r\n]*\)/g;
const BARE_CITATION = /[ \t]*\[\[\d+\]\]/g;

/** Removes app-only resource targets from a shared question. */
export function sanitizeConversationShareQuestion(content: string): string {
  return content.replace(INTERNAL_RESOURCE_LINK, '$1');
}

/** Removes app-only resource targets and citation markers from a shared answer. */
export function sanitizeConversationShareAnswer(content: string): string {
  return sanitizeConversationShareQuestion(content)
    .replace(LINKED_CITATION, '')
    .replace(BARE_CITATION, '');
}
