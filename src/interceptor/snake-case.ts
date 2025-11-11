import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { transformKeysToSnakeCase } from './utils';
import {
  Injectable,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';

@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((response) => {
        // Skip transformation for Express Response objects
        if (this.isNativeExpressResponse(response)) {
          return response;
        }
        return transformKeysToSnakeCase(response);
      }),
    );
  }

  private isNativeExpressResponse(response: any): boolean {
    if (!response || typeof response !== 'object') {
      return false;
    }

    // Check if it's a ServerResponse (Node.js HTTP response)
    if (response.constructor?.name === 'ServerResponse') {
      return true;
    }

    // Check for common Express Response properties
    return ['statusCode', 'send', 'getHeader', 'req'].every(
      (feat) => feat in response,
    );
  }
}
