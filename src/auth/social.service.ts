import { EntityManager } from 'typeorm';
import generateId from 'omniboxd/utils/generate-id';
import { UserService } from 'omniboxd/user/user.service';
import { WechatCheckResponseDto } from 'omniboxd/auth/dto/wechat-login.dto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { CacheService } from 'omniboxd/common/cache.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { isNameBlocked } from 'omniboxd/utils/blocked-names';
import { filterEmoji } from 'omniboxd/utils/emoji';

export interface UserSocialState {
  type: string;
  createdAt: number;
  expiresIn: number;
  nonce?: string;
  userInfo?: WechatCheckResponseDto['user'];
  redirectUrl?: string;
}

const ALL_CJK_PATTERN =
  /[\u4e00-\u9fa5]|[\u3040-\u309f]|[\u30a0-\u30ff]|[\uac00-\ud7af]/;

@Injectable()
export class SocialService {
  private readonly namespace = '/social/states';
  private readonly minUsernameLength = 2;
  private readonly maxUsernameLength = 32;

  constructor(
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly cacheService: CacheService,
    private readonly namespacesService: NamespacesService,
  ) {}

  /**
   * Generate a kv state, return a kv key
   * @param type
   * @param prefix
   * @return key
   */
  async generateState(
    type: string,
    prefix: string = '',
    nonce: string = '',
    redirectUrl?: string,
  ): Promise<string> {
    const key = `${prefix ? prefix + '_' : ''}${generateId()}`;
    const expiresIn = 5 * 60 * 1000; // Expires in 5 minutes
    await this.cacheService.set<UserSocialState>(
      this.namespace,
      key,
      {
        type,
        nonce,
        redirectUrl,
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

  private async isUsernameValid(
    username: string,
    manager: EntityManager,
  ): Promise<boolean> {
    if (isNameBlocked(username)) {
      return false;
    }

    const user = await this.userService.findByUsername(username, manager);
    if (user) {
      return false;
    }

    const namespaceName = this.i18n.t('namespace.userNamespaceName', {
      args: { userName: username },
    });
    const namespace = await this.namespacesService.getNamespaceByName(
      namespaceName,
      manager,
    );
    if (namespace) {
      return false;
    }

    return true;
  }

  async getValidUsername(
    nickname: string,
    manager: EntityManager,
  ): Promise<string> {
    // Filter out emoji characters from nickname
    const filteredNickname = filterEmoji(nickname);
    let username = filteredNickname;

    if (username.length > this.maxUsernameLength) {
      username = filteredNickname.slice(0, this.maxUsernameLength);
    }
    if (username.length >= this.minUsernameLength) {
      const ok = await this.isUsernameValid(username, manager);
      if (ok) {
        return username;
      }
    }

    username = filteredNickname.slice(0, this.maxUsernameLength - 5);
    for (let i = 0; i < 5; i++) {
      const curUsername = username + this.generateSuffix();
      const ok = await this.isUsernameValid(curUsername, manager);
      if (ok) {
        return curUsername;
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

  /**
   * Format user name based on regional conventions.
   * Asian (ZH, JA, KO): LastName + FirstName (no space)
   * Others: FirstName + LastName (with space)
   */
  formatName(
    firstName: string | undefined,
    lastName: string | undefined,
    lang?: string,
  ): string {
    const fName = firstName?.trim() || '';
    const lName = lastName?.trim() || '';

    if (!fName && !lName) return '';
    if (!fName) return lName;
    if (!lName) return fName;

    // Asian languages: Chinese, Japanese, Korean
    const asianLangList = ['zh', 'ja', 'ko'];
    const isAsianLang =
      lang && asianLangList.some((l) => lang.toLowerCase().startsWith(l));

    // CJK character ranges (Chinese, Japanese, Korean)
    const allCJK = ALL_CJK_PATTERN.test(fName) && ALL_CJK_PATTERN.test(lName);

    if (isAsianLang || allCJK) {
      return `${lName}${fName}`;
    }

    return `${fName} ${lName}`;
  }
}
