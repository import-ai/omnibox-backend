import duplicateName from './duplicate-name';

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

/**
 * Generate a unique resource name by appending (x) suffix
 * Handles names that already have (x) suffix by incrementing the number
 */
export function generateUniqueResourceName(
  baseName: string,
  isNameExists: (name: string) => boolean | Promise<boolean>,
  maxAttempts: number = 100,
): string | Promise<string> {
  let name = baseName;

  // Check if isNameExists is async
  const checkResult = isNameExists(name);

  if (checkResult instanceof Promise) {
    // Async version
    return (async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const exists = await isNameExists(name);
        if (!exists) {
          return name;
        }
        name = duplicateName(name);
      }
      throw new Error(
        `Failed to generate unique name after ${maxAttempts} attempts`,
      );
    })();
  } else {
    // Sync version
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!isNameExists(name)) {
        return name;
      }
      name = duplicateName(name);
    }
    throw new Error(
      `Failed to generate unique name after ${maxAttempts} attempts`,
    );
  }
}
