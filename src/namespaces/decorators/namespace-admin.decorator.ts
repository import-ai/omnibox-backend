import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { NamespaceAdminInterceptor } from '../interceptors/namespace-admin.interceptor';

export const NamespaceAdmin = () =>
  applyDecorators(UseInterceptors(NamespaceAdminInterceptor));
