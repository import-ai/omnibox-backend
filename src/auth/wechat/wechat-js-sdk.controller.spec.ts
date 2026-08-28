import { PATH_METADATA } from '@nestjs/common/constants';

import { WechatJsSdkController } from './wechat-js-sdk.controller';
import { WechatJsSdkService } from './wechat-js-sdk.service';

describe('WechatJsSdkController', () => {
  it('exposes both shared WeChat JS-SDK signature routes', () => {
    const handler = Object.getOwnPropertyDescriptor(
      WechatJsSdkController.prototype,
      'createSignature',
    )?.value;

    expect(Reflect.getMetadata(PATH_METADATA, WechatJsSdkController)).toBe(
      'api/v1/wechat',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toEqual([
      'js-sdk/signature',
      'js-sdk-signature',
    ]);
  });

  it('delegates signature creation to the shared service', async () => {
    const createSignature = jest.fn().mockResolvedValue({ signature: 'hash' });
    const controller = new WechatJsSdkController({
      createSignature,
    } as unknown as WechatJsSdkService);

    await expect(
      controller.createSignature('https://test.omnibox.pro/zh-cn/'),
    ).resolves.toEqual({ signature: 'hash' });
    expect(createSignature).toHaveBeenCalledWith(
      'https://test.omnibox.pro/zh-cn/',
    );
  });
});
