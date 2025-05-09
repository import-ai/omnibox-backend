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
    return next.handle().pipe(map((data) => transformKeysToSnakeCase(data)));
  }
}
