import { hasDeliverableContent } from './deliverable-content';

it.each([
  '# A title',
  'A title',
  'A title\n=======',
  'A title\n-------',
  ' \n',
])('rejects title-only web output: %s', (markdown) => {
  expect(
    hasDeliverableContent({
      function: 'collect',
      output: { title: 'A title', markdown },
    }),
  ).toBe(false);
});
it.each([
  '# A title\n\nA real body',
  'A short body',
  '![photo](https://example.com/image.png)',
])('accepts delivered web content: %s', (markdown) => {
  expect(
    hasDeliverableContent({
      function: 'collect',
      output: { title: 'A title', markdown },
    }),
  ).toBe(true);
});
it('does not apply webpage heuristics to file or media results', () => {
  expect(
    hasDeliverableContent({
      function: 'file_reader_pdf',
      output: { title: 'A title', markdown: '# A title' },
    }),
  ).toBe(true);
});
it('honors a producer reporting no body even when it returns metadata text', () => {
  expect(
    hasDeliverableContent({
      function: 'collect',
      output: { markdown: 'metadata only', body_delivered: false },
    }),
  ).toBe(false);
});
