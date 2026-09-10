// Maximum length of a tag name. Tags are also produced by the wizard's
// automatic tag extraction, where users can define their own classification
// scheme in .omnibox/TAGS.md; hierarchical schemes like
// `Work/Software Development` routinely exceed twenty characters, so the limit
// has to leave room for them.
export const MAX_TAG_NAME_LENGTH = 64;
