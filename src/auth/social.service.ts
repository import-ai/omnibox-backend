import { EntityManager } from 'typeorm';
import generateId from 'omniboxd/utils/generate-id';
import { UserService } from 'omniboxd/user/user.service';
import { WechatCheckResponseDto } from 'omniboxd/auth/dto/wechat-login.dto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { CacheService } from 'omniboxd/common/cache.service';

export interface UserSocialState {
  type: string;
  createdAt: number;
  expiresIn: number;
  userInfo?: WechatCheckResponseDto['user'];
}

@Injectable()
export class SocialService {
  private readonly namespace = '/social/states';
  private readonly minUsernameLength = 2;
  private readonly maxUsernameLength = 32;

  constructor(
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Generate a kv state, return a kv key
   * @param type
   * @param prefix
   * @return key
   */
  async generateState(type: string, prefix: string = ''): Promise<string> {
    const key = `${prefix ? prefix + '_' : ''}${generateId()}`;
    const expiresIn = 5 * 60 * 1000; // Expires in 5 minutes
    await this.cacheService.set<UserSocialState>(
      this.namespace,
      key,
      {
        type,
        createdAt: Date.now(),
        expiresIn,
      },
      expiresIn,
    );
    return key;
  }

  async getState(state: string) {
    return await this.cacheService.get<UserSocialState>(this.namespace, state);
  }

  async updateState(state: string, data: UserSocialState) {
    const ttl = data.expiresIn - (Date.now() - data.createdAt);
    if (ttl > 0) {
      await this.cacheService.set<UserSocialState>(
        this.namespace,
        state,
        data,
        ttl,
      );
    }
  }

  private generateSuffix(): string {
    return (
      '_' +
      generateId(4, 'useandomTPXpxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict')
    );
  }

  async getValidUsername(
    nickname: string,
    manager: EntityManager,
  ): Promise<string> {
    let username = nickname;

    if (username.length > this.maxUsernameLength) {
      username = nickname.slice(0, this.maxUsernameLength);
    }
    if (username.length >= this.minUsernameLength) {
      const user = await this.userService.findByUsername(username, manager);
      if (!user) {
        return username;
      }
    }

    username = nickname.slice(0, this.maxUsernameLength - 5);
    for (let i = 0; i < 5; i++) {
      const suffix = this.generateSuffix();
      const user = await this.userService.findByUsername(
        username + suffix,
        manager,
      );
      if (!user) {
        return username + suffix;
      }
    }

    const message = this.i18n.t('auth.errors.unableToGenerateUsername');
    throw new AppException(
      message,
      'UNABLE_TO_GENERATE_USERNAME',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async canUnBinding(userId: string) {
    const user = await this.userService.find(userId);
    if (user.email) {
      return true;
    }
    const binding = await this.userService.listBinding(userId);
    return binding.length > 1;
  }
}
