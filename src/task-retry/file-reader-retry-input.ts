import {
  EXT_TO_FILE_READER_FN,
  fileReaderFunctionForName,
} from 'omniboxd/tasks/file-reader-functions';
import * as path from 'path';

const FILE_ID_KEYS = ['file_id', 'fileId'] as const;

export interface LegacyFileReaderFile {
  name: string;
  mimetype: string;
}

export type FileReaderFunctionInference =
  | { kind: 'conflict' }
  | { kind: 'resolved'; fn: string }
  | { kind: 'unsupported_extension' };

export function isPlainRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isUsableName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The target resource id a legacy file_reader task points at. Only the payload
 * identifies it; the input's resource_id is validated against it, never used to
 * find the resource.
 */
export function payloadResourceId(payload: unknown): string | undefined {
  if (!isPlainRecord(payload)) {
    return undefined;
  }
  const resourceId = payload.resource_id;
  return typeof resourceId === 'string' && resourceId !== ''
    ? resourceId
    : undefined;
}

/**
 * An existing resource_id must match the target exactly; a genuinely missing
 * one is filled in. A present-but-different value (null, '', non-string, other
 * id) is rejected.
 */
export function withTargetResourceId(
  input: Record<string, any>,
  resourceId: string,
): Record<string, any> | undefined {
  if (hasOwn(input, 'resource_id')) {
    return input.resource_id === resourceId ? input : undefined;
  }
  return { ...input, resource_id: resourceId };
}

/**
 * The function kind of a name the worker can use as-is: the raw value must
 * carry a supported extension, because the worker derives the format from the
 * raw file name it saves. Trailing whitespace therefore makes a name invalid,
 * while leading whitespace does not.
 */
export function effectiveFileNameFunction(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.trim() === '' || value === '.' || value === '..') {
    return undefined;
  }
  if (value.includes('/') || value.includes('\\')) {
    return undefined;
  }
  if (path.isAbsolute(value)) {
    return undefined;
  }
  return EXT_TO_FILE_READER_FN[path.extname(value).toLowerCase()];
}

export function isEffectiveFileNameFor(value: unknown, fn: string): boolean {
  return effectiveFileNameFunction(value) === fn;
}

/**
 * Choose the worker from the task's own names, and detect the case where the
 * two names disagree. A conflict is reported before any worker is chosen,
 * because only the bound file row may settle which one is right.
 */
export function inferFileReaderFunction(
  input: Record<string, any>,
): FileReaderFunctionInference {
  const originalNameFn = isUsableName(input.original_name)
    ? fileReaderFunctionForName(input.original_name)
    : undefined;
  const fileNameFn = isUsableName(input.filename)
    ? fileReaderFunctionForName(input.filename)
    : undefined;
  if (originalNameFn && fileNameFn && originalNameFn !== fileNameFn) {
    return { kind: 'conflict' };
  }
  const selected = isUsableName(input.original_name)
    ? input.original_name
    : isUsableName(input.filename)
      ? input.filename
      : undefined;
  const fn =
    selected === undefined ? undefined : fileReaderFunctionForName(selected);
  if (!fn) {
    return { kind: 'unsupported_extension' };
  }
  return { kind: 'resolved', fn };
}

/**
 * Whether the final input satisfies what both file_reader workers read.
 * `filename` is optional, but when present it is the effective name and must be
 * valid. `original_name` must always be present because the worker's
 * `input.get("filename", input["original_name"])` evaluates its default
 * eagerly; its value is unused when `filename` is present.
 */
export function satisfiesWorkerContract(
  input: Record<string, any>,
  fn: string,
  resourceId: string,
): boolean {
  if (!hasOwn(input, 'title') || typeof input.title !== 'string') {
    return false;
  }
  if (!hasOwn(input, 'original_name')) {
    return false;
  }
  if (!hasOwn(input, 'mimetype') || typeof input.mimetype !== 'string') {
    return false;
  }
  if (input.resource_id !== resourceId) {
    return false;
  }
  if (hasOwn(input, 'filename')) {
    return isEffectiveFileNameFor(input.filename, fn);
  }
  return isEffectiveFileNameFor(input.original_name, fn);
}

/**
 * Values of every file-id field present on the old task (input or payload).
 * Only fields that exist count: the retry path never adds one, and a value on
 * the resource alone proves nothing about what the old task read.
 */
export function fileIdEvidenceValues(
  input: Record<string, any>,
  payload: unknown,
): unknown[] {
  const values: unknown[] = [];
  for (const source of [input, payload]) {
    if (!isPlainRecord(source)) {
      continue;
    }
    for (const key of FILE_ID_KEYS) {
      if (hasOwn(source, key)) {
        values.push(source[key]);
      }
    }
  }
  return values;
}

/**
 * Derive a worker-valid input from the bound file row, preserving every other
 * key of the old input (including any file-id fields it already had). Returns
 * undefined when no valid input can be built.
 */
export function repairFileReaderInput(
  input: Record<string, any>,
  fn: string,
  resourceId: string,
  file: LegacyFileReaderFile,
): Record<string, any> | undefined {
  const repaired: Record<string, any> = { ...input };
  if (!hasOwn(repaired, 'mimetype') || typeof repaired.mimetype !== 'string') {
    if (typeof file.mimetype !== 'string' || file.mimetype === '') {
      return undefined;
    }
    repaired.mimetype = file.mimetype;
  }
  // The file row has no title, so a missing or non-string title is final.
  if (!hasOwn(repaired, 'title') || typeof repaired.title !== 'string') {
    return undefined;
  }
  if (
    !hasOwn(repaired, 'original_name') ||
    !isEffectiveFileNameFor(repaired.original_name, fn)
  ) {
    repaired.original_name = file.name;
  }
  if (
    hasOwn(repaired, 'filename') &&
    !isEffectiveFileNameFor(repaired.filename, fn)
  ) {
    // The worker falls back to the confirmed original_name without it.
    delete repaired.filename;
  }
  if (!satisfiesWorkerContract(repaired, fn, resourceId)) {
    return undefined;
  }
  return repaired;
}
