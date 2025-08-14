import { isEmpty } from './is-empty';

describe('isEmpty', () => {
  test.each([
    ['', true],
    [[], true],
    [{}, true],
    [null, true],
    [undefined, true],

    // Non-empty values - should return false
    ['hello', false],
    [' ', false],
    ['0', false],
    [[1], false],
    [[1, 2, 3], false],
    [[null], false],
    [[undefined], false],
    [{ a: 1 }, false],
    [{ a: null }, false],
    [{ a: undefined }, false],
  ])('should return %s for %s', (input, expected) => {
    expect(isEmpty(input)).toBe(expected);
  });
});
