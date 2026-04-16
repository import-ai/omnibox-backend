export function last<T>(arr?: T[]): T {
  if (!Array.isArray(arr)) {
    throw new TypeError('Expected an array');
  }
  if (arr.length === 0) {
    throw new Error('Empty array');
  }
  return arr[arr.length - 1];
}
