import generateId from './generate-id';

const WORD_CHAR_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';

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
  return `_${generateId(4, WORD_CHAR_ALPHABET)}`;
}

/**
 * Generate a unique resource name by appending _\w{4} on conflict.
 */
export function generateUniqueResourceName(
  baseName: string,
  isNameExists: (name: string) => boolean | Promise<boolean>,
  maxAttempts: number = 100,
): string | Promise<string> {
  const checkResult = isNameExists(baseName);

  if (checkResult instanceof Promise) {
    return (async () => {
      let name = baseName;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          name = `${baseName}${randomResourceNameSuffix()}`;
        }
        const exists = await isNameExists(name);
        if (!exists) {
          return name;
        }
      }
      throw new Error(
        `Failed to generate unique name after ${maxAttempts} attempts`,
      );
    })();
  }

  let name = baseName;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      name = `${baseName}${randomResourceNameSuffix()}`;
    }
    if (!isNameExists(name)) {
      return name;
    }
  }
  throw new Error(
    `Failed to generate unique name after ${maxAttempts} attempts`,
  );
}
