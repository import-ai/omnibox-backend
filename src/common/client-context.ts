import { AsyncLocalStorage } from 'node:async_hooks';

export interface ClientContext {
  installationId: string | null;
}

const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const storage = new AsyncLocalStorage<ClientContext>();

export function runWithClientContext<T>(
  context: ClientContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function getClientContext(): ClientContext {
  return storage.getStore() ?? { installationId: null };
}

export function parseInstallationId(
  raw: string | string[] | undefined | null,
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return INSTALLATION_ID_PATTERN.test(trimmed) ? trimmed : null;
}
