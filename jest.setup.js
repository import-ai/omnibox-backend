jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(),
}));
