import { appendQueryParams, appendTokenToUrl } from './url-utils';

describe('URL Utils', () => {
  describe('appendQueryParams', () => {
    it('should append params to URL without query string', () => {
      const result = appendQueryParams('https://example.com/path', {
        foo: 'bar',
        baz: 'qux',
      });
      expect(result).toBe('https://example.com/path?foo=bar&baz=qux');
    });

    it('should append params to URL with existing query string', () => {
      const result = appendQueryParams(
        'https://example.com/path?existing=param',
        {
          foo: 'bar',
        },
      );
      expect(result).toBe('https://example.com/path?existing=param&foo=bar');
    });

    it('should handle special characters in params', () => {
      const result = appendQueryParams('https://example.com/path', {
        email: 'test@example.com',
        name: 'John Doe',
      });
      expect(result).toContain('email=test%40example.com');
      expect(result).toContain('name=John+Doe');
    });
  });

  describe('appendTokenToUrl', () => {
    it('should append token to URL without query string', () => {
      const result = appendTokenToUrl('https://example.com/path', 'abc123');
      expect(result).toBe('https://example.com/path?token=abc123');
    });

    it('should append token to URL with existing query string', () => {
      const result = appendTokenToUrl(
        'https://example.com/path?foo=bar',
        'abc123',
      );
      expect(result).toBe('https://example.com/path?foo=bar&token=abc123');
    });

    it('should support custom param name', () => {
      const result = appendTokenToUrl(
        'https://example.com/path',
        'abc123',
        'code',
      );
      expect(result).toBe('https://example.com/path?code=abc123');
    });

    it('should handle tokens with special characters', () => {
      const result = appendTokenToUrl(
        'https://example.com/path',
        'token+with/special=chars',
      );
      expect(result).toContain('token=token%2Bwith%2Fspecial%3Dchars');
    });
  });
});
