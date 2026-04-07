import { appendQueryParams, appendTokenToUrl, validateUrl } from './url-utils';

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

  describe('validateUrl', () => {
    it('should validate http URLs', () => {
      const result = validateUrl('http://example.com/path');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.protocol).toBe('http:');
        expect(result.url.hostname).toBe('example.com');
      }
    });

    it('should validate https URLs', () => {
      const result = validateUrl('https://example.com/path?query=1');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.protocol).toBe('https:');
      }
    });

    it('should validate ftp URLs', () => {
      const result = validateUrl('ftp://example.com/file.txt');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.protocol).toBe('ftp:');
      }
    });

    it('should validate file URLs', () => {
      const result = validateUrl('file:///etc/passwd');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.protocol).toBe('file:');
      }
    });

    it('should validate javascript URLs', () => {
      const result = validateUrl('javascript:alert(1)');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.protocol).toBe('javascript:');
      }
    });

    it('should validate data URLs', () => {
      const result = validateUrl('data:text/html,<script>alert(1)</script>');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.protocol).toBe('data:');
      }
    });

    it('should reject invalid URL format', () => {
      const result = validateUrl('not-a-valid-url');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe('Invalid URL format');
      }
    });

    it('should reject empty URL', () => {
      const result = validateUrl('');
      expect(result.valid).toBe(false);
    });

    it('should reject malformed URLs', () => {
      // new URL('http://') throws an error
      const result = validateUrl('http://');
      expect(result.valid).toBe(false);
    });

    it('should reject URLs with spaces', () => {
      const result = validateUrl('http://example .com');
      expect(result.valid).toBe(false);
    });
  });
});
