import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { NamespaceOwnerInterceptor } from '../interceptors/namespace-owner.interceptor';

export const NamespaceOwner = () =>
  applyDecorators(UseInterceptors(NamespaceOwnerInterceptor));
