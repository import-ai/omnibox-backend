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

jest.mock('nanoid', () => ({
  customAlphabet,
}));
