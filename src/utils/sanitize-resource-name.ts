import generateId from './generate-id';

const LOWERCASE_ALPHANUMERIC_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Sanitize resource name by replacing '/' with '_'
 */
export function sanitizeResourceName(
  name: string | undefined,
): string | undefined {
  if (!name) {
    return name;
  }
  return name.replace(/\//g, '_');
}

export function randomResourceNameSuffix(): string {
  return `_${generateId(4, LOWERCASE_ALPHANUMERIC_ALPHABET)}`;
}

export class UniqueResourceNameExhaustedError extends Error {
  constructor(maxAttempts: number) {
    super(`Failed to generate unique name after ${maxAttempts} attempts`);
    this.name = 'UniqueResourceNameExhaustedError';
  }
}

/**
 * Generate a unique resource name by appending _[a-z0-9]{4} on conflict.
 */
export function generateUniqueResourceName(
  baseName: string,
  isNameExists: (name: string) => boolean | Promise<boolean>,
  maxAttempts: number = 100,
): string | Promise<string> {
  // The first check doubles as sync/async detection; its result is reused so a
  // rejected promise is never left unhandled.
  const checkResult = isNameExists(baseName);

  if (checkResult instanceof Promise) {
    return (async () => {
      if (!(await checkResult)) {
        return baseName;
      }
      for (let attempt = 1; attempt < maxAttempts; attempt++) {
        const name = `${baseName}${randomResourceNameSuffix()}`;
        if (!(await isNameExists(name))) {
          return name;
        }
      }
      throw new UniqueResourceNameExhaustedError(maxAttempts);
    })();
  }

  if (!checkResult) {
    return baseName;
  }
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const name = `${baseName}${randomResourceNameSuffix()}`;
    if (!isNameExists(name)) {
      return name;
    }
  }
  throw new UniqueResourceNameExhaustedError(maxAttempts);
}
