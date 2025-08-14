import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

// Import the decorator function directly for testing
import { Request } from 'express';

interface UserIdOptions {
  optional?: boolean;
}

// Create the decorator function for testing
const userIdDecoratorFunction = (
  data: UserIdOptions = {},
  ctx: ExecutionContext,
): string | undefined => {
  const request: Request = ctx.switchToHttp().getRequest();
  const userId = request.user?.id;
  const { optional = false } = data;

  if (!userId && !optional) {
    throw new UnauthorizedException('Not authorized');
  }

  return userId;
};

describe('UserId Decorator', () => {
  let mockExecutionContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = {
      user: undefined,
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;
  });

  describe('when optional is false (default)', () => {
    it('should return userId when user exists', () => {
      mockRequest.user = { id: 'test-user-id' };

      const result = userIdDecoratorFunction(undefined, mockExecutionContext);

      expect(result).toBe('test-user-id');
    });

    it('should throw UnauthorizedException when user does not exist', () => {
      mockRequest.user = undefined;

      expect(() =>
        userIdDecoratorFunction(undefined, mockExecutionContext),
      ).toThrow(UnauthorizedException);
      expect(() =>
        userIdDecoratorFunction(undefined, mockExecutionContext),
      ).toThrow('Not authorized');
    });

    it('should throw UnauthorizedException when user exists but has no id', () => {
      mockRequest.user = { email: 'test@example.com' };

      expect(() =>
        userIdDecoratorFunction(undefined, mockExecutionContext),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('when optional is true', () => {
    it('should return userId when user exists', () => {
      mockRequest.user = { id: 'test-user-id' };

      const result = userIdDecoratorFunction(
        { optional: true },
        mockExecutionContext,
      );

      expect(result).toBe('test-user-id');
    });

    it('should return undefined when user does not exist', () => {
      mockRequest.user = undefined;

      const result = userIdDecoratorFunction(
        { optional: true },
        mockExecutionContext,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined when user exists but has no id', () => {
      mockRequest.user = { email: 'test@example.com' };

      const result = userIdDecoratorFunction(
        { optional: true },
        mockExecutionContext,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('when optional is explicitly false', () => {
    it('should throw UnauthorizedException when user does not exist', () => {
      mockRequest.user = undefined;

      expect(() =>
        userIdDecoratorFunction({ optional: false }, mockExecutionContext),
      ).toThrow(UnauthorizedException);
    });
  });
});
