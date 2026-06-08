function randomChoice(choices: string) {
  return choices[Math.floor(Math.random() * choices.length)];
}

function customAlphabet(alphabet: string, size: number) {
  return () => {
    let result = '';
    for (let i = 0; i < size; i++) {
      result += randomChoice(alphabet);
    }
    return result;
  };
}

process.env.OBB_PRO_URL = '';

expect.extend({
  withResponseFailedLog(received, expected, onFail) {
    const pass = this.equals(received, expected);
    if (!pass && onFail) {
      onFail(received);
    }
    return {
      pass,
      message: () => `expected ${received} to equal ${expected}`,
    };
  },
});

jest.mock('nanoid', () => ({
  customAlphabet,
}));

jest.mock('@css-inline/css-inline', () => ({
  inline: (html: string) => html,
  inlineFragment: (html: string) => html,
  version: 'test',
}));
