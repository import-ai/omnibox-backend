import { isObject } from 'lodash';

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function transformKeysToSnakeCase(data: any): any {
  if (data instanceof Date) {
    return data.toISOString();
  }
  if (Array.isArray(data)) {
    return data.map((item) => transformKeysToSnakeCase(item));
  }
  if (isObject(data)) {
    return Object.keys(data).reduce((acc, key) => {
      const snakeKey = camelToSnake(key);
      acc[snakeKey] = transformKeysToSnakeCase(data[key]);
      return acc;
    }, {});
  }
  return data;
}
