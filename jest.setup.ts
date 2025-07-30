function randomChoice(choices) {
  return choices[Math.floor(Math.random() * choices.length)];
}

function customAlphabet(alphabet, size) {
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
