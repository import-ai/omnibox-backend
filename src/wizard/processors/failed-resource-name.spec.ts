import { prefixFailedResourceName } from './failed-resource-name';

describe('prefixFailedResourceName', () => {
  it('prefixes the resource name with ❌', () => {
    expect(prefixFailedResourceName('Test Resource')).toBe('❌ Test Resource');
  });

  it('does not stack ❌ on retry', () => {
    expect(prefixFailedResourceName('❌ Test Resource')).toBe(
      '❌ Test Resource',
    );
  });

  it('replaces locale failure labels with ❌', () => {
    expect(prefixFailedResourceName('失败：Test Resource')).toBe(
      '❌ Test Resource',
    );
    expect(prefixFailedResourceName('error: Test Resource')).toBe(
      '❌ Test Resource',
    );
    expect(prefixFailedResourceName('ERROR: Test Resource')).toBe(
      '❌ Test Resource',
    );
  });

  it('prefixes an empty name', () => {
    expect(prefixFailedResourceName(undefined)).toBe('❌ ');
    expect(prefixFailedResourceName('')).toBe('❌ ');
  });
});
