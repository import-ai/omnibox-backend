import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { NamespaceReadonlyInterceptor } from '../interceptors/namespace-readonly.interceptor';

export const CheckNamespaceReadonly = () =>
  applyDecorators(UseInterceptors(NamespaceReadonlyInterceptor));
