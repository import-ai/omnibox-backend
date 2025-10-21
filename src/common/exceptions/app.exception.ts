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

  constructor(
    message: string,
    code: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    // Call parent constructor (pass response body and HTTP status)
    super({ message, code }, statusCode);
    this.code = code;
  }

  // Override getResponse to ensure a consistent response format
  override getResponse() {
    return {
      statusCode: this.getStatus(),
      code: this.code,
      message: this.message,
      timestamp: new Date().toISOString(),
    };
  }
}
