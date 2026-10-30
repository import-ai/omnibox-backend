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
export async function generateUniqueResourceName(
  baseName: string,
  isNameExists: (name: string) => boolean | Promise<boolean>,
  maxAttempts: number = 100,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const name =
      attempt === 0 ? baseName : `${baseName}${randomResourceNameSuffix()}`;
    if (!(await isNameExists(name))) {
      return name;
    }
  }
  throw new UniqueResourceNameExhaustedError(maxAttempts);
}
