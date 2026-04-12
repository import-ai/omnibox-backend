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

// Mock HandlebarsAdapter to prevent @css-inline native module from loading
// which causes open handle issues in Jest
jest.mock('@nestjs-modules/mailer/adapters/handlebars.adapter', () => ({
  HandlebarsAdapter: jest.fn().mockImplementation(() => ({
    compile: jest.fn((template: string) => () => template),
  })),
}));
