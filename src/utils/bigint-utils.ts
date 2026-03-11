export function bigintStringToNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new TypeError(`Invalid bigint string value: ${value}`);
  }
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(
      `Bigint value exceeds JS safe integer range: ${value}`,
    );
  }
  return parsed;
}

export function nullableBigintStringToNumber(
  value: string | null,
): number | null {
  if (value === null) {
    return null;
  }
  return bigintStringToNumber(value);
}

export function numberToBigintString(value: number): string {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Invalid integer value: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Integer exceeds JS safe range: ${value}`);
  }
  return String(value);
}
