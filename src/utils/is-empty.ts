/**
 * Checks if a string, array, or record is empty.
 *
 * @param value - The value to check (string, array, or record)
 * @returns true if the value is empty, false otherwise
 *
 * @example
 * isEmpty('') // true
 * isEmpty([]) // true
 * isEmpty({}) // true
 * isEmpty('hello') // false
 * isEmpty([1, 2, 3]) // false
 * isEmpty({ a: 1 }) // false
 */
export function isEmpty(
  value: string | any[] | Record<string, any> | undefined | null,
): boolean {
  if (value === undefined || value === null) {
    return true; // null, undefined are considered empty
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value).length === 0;
  }

  throw new TypeError(
    'Expected a string, array, or record, but received: ' + typeof value,
  );
}
