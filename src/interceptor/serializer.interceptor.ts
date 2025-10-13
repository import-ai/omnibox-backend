import { ClassSerializerInterceptor } from '@nestjs/common/serializer';

export class SerializerInterceptor extends ClassSerializerInterceptor {
  serialize(response, options) {
    if (this.isNativeExpressResponse(response)) {
      return response;
    }
    return super.serialize(response, options);
  }

  private isNativeExpressResponse(response) {
    if (!response || typeof response !== 'object') {
      return false;
    }

    if (response.constructor?.name === 'ServerResponse') {
      return true;
    }

    return ['statusCode', 'send', 'getHeader', 'req'].every(
      (feat) => feat in response,
    );
  }
}
