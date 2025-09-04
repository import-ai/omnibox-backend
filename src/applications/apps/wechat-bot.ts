import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { Repository } from 'typeorm';
import { Applications } from 'omniboxd/applications/applications.entity';

export interface WechatBotCallbackDto {
  code: string;
  user_id: string;
  nickname: string;
}

export class WechatBot extends BaseApp {
  constructor(
    private readonly applicationsRepository: Repository<Applications>,
  ) {
    super();
  }

  private async generateUniqueVerifyCode(): Promise<string> {
    let verifyCode = '';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      verifyCode = Math.floor(100000 + Math.random() * 900000).toString();

      const existingAuth = await this.applicationsRepository
        .createQueryBuilder('apps')
        .where('apps.app_id = :appId', { appId: 'wechat_bot' })
        .andWhere("apps.attrs->>'verify_code' = :verifyCode", { verifyCode })
        .getOne();

      if (!existingAuth) {
        return verifyCode;
      }

      attempts++;
    }

    throw new Error(
      'Failed to generate unique verify code after maximum attempts',
    );
  }

  async getAttrs(
    _namespaceId: string,
    _userId: string,
    createDto: any,
  ): Promise<Record<string, any>> {
    const attrs = createDto.attrs || {};
    return {
      ...attrs,
      verify_code: await this.generateUniqueVerifyCode(),
    };
  }

  async callback(data: WechatBotCallbackDto): Promise<Record<string, any>> {
    const entity = await this.applicationsRepository
      .createQueryBuilder('apps')
      .where('apps.app_id = :appId', { appId: 'wechat_bot' })
      .andWhere("apps.attrs->>'verify_code' = :code", { code: data.code })
      .getOne();

    if (!entity) {
      return { status: 'error', message: 'Invalid verification code' };
    }

    entity.attrs = {
      ...entity.attrs,
      user_id: data.user_id,
      nickname: data.nickname,
    };



    await this.applicationsRepository.save(entity);

    return { status: 'success', data: entity };
  }
}
