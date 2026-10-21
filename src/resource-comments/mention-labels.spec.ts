import { mentionDisplayName, rewriteMentionLabels } from './mention-labels';

describe('mention labels', () => {
  it('formats a nickname the same way as the document editor', () => {
    expect(
      mentionDisplayName({
        nickname: 'Lizhi',
        username: 'Alice',
        email: 'a@b.c',
        userId: 'u1',
      }),
    ).toBe('Lizhi（Alice）');
  });

  it('rewrites a current member and keeps a departed member label', () => {
    const names = { u1: 'Lizhi（Alice）' };
    expect(
      rewriteMentionLabels(
        'See [@ id="u1" label="Alice"] and [@ id="gone" label="Old"]',
        names,
      ),
    ).toBe(
      'See [@ id="u1" label="Lizhi（Alice）"] and [@ id="gone" label="Old"]',
    );
  });

  it('does not rewrite a label that is already current', () => {
    const markdown = '[@ id="u1" label="Lizhi（Alice）"]';
    expect(rewriteMentionLabels(markdown, { u1: 'Lizhi（Alice）' })).toBe(
      markdown,
    );
  });
});
