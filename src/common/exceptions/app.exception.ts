import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Custom business exception
 * @param message Error message
 * @param code Business error code (e.g., 10001, 20002)
 * @param statusCode HTTP status code (default 400)
 */
export class AppException extends HttpException {
  // Business error code
  public readonly code: string;
  // Additional error data
  public readonly data?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    data?: Record<string, any>,
  ) {
    // Call parent constructor (pass response body and HTTP status)
    super({ message, code, ...data }, statusCode);
    this.code = code;
    this.data = data;
  }

  // Override getResponse to ensure a consistent response format
  override getResponse() {
    return {
      statusCode: this.getStatus(),
      code: this.code.toLowerCase(),
      message: this.message,
      ...(this.data || {}),
      timestamp: new Date().toISOString(),
    };
  }
}
