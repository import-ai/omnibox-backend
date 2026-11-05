/**
 * `attrs.origin` marks resources created by system features. Public create and
 * update paths strip the client-supplied value so it cannot be forged or
 * cleared; internal routes may still write it.
 */
export function withoutClientOrigin(
  attrs: Record<string, any> | null | undefined,
): Record<string, any> | undefined {
  if (attrs === undefined) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { origin: _origin, ...rest } = attrs ?? {};
  return rest;
}
