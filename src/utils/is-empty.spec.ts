import { isEmpty } from './is-empty';

describe('isEmpty', () => {
  test.each([
    // Empty values - should return true
    ['', true, 'empty string'],
    [[], true, 'empty array'],
    [{}, true, 'empty object'],
    [null, true, 'empty object'],
    [undefined, true, 'empty object'],

    // Non-empty values - should return false
    ['hello', false, 'non-empty string'],
    [' ', false, 'string with space'],
    ['0', false, 'string with zero'],
    [[1], false, 'array with one element'],
    [[1, 2, 3], false, 'array with multiple elements'],
    [[null], false, 'array with null element'],
    [[undefined], false, 'array with undefined element'],
    [{ a: 1 }, false, 'object with property'],
    [{ a: null }, false, 'object with null value'],
    [{ a: undefined }, false, 'object with undefined value'],
  ])('should return %s for %s (%s)', (input, expected, description) => {
    expect(isEmpty(input)).toBe(expected);
  });
});
