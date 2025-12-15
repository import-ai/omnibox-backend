import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'omniboxd/user/user.service';
import { SocialService } from 'omniboxd/auth/social.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import { Logger, Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { transaction } from 'omniboxd/utils/transaction-utils';

export interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: Array<string>;
  unionid: string;
}

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly openAppId: string;
  private readonly openAppSecret: string;
  private readonly oldAppId: string;
  private readonly oldAppSecret: string;
  private readonly oldOpenAppId: string;
  private readonly oldOpenAppSecret: string;
  private readonly redirectUri: string;
  private readonly migrationRedirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly socialService: SocialService,
  ) {
    this.appId = this.configService.get<string>('OBB_WECHAT_APP_ID', '');
    this.appSecret = this.configService.get<string>(
      'OBB_WECHAT_APP_SECRET',
      '',
    );
    this.openAppId = this.configService.get<string>(
      'OBB_OPEN_WECHAT_APP_ID',
      '',
    );
    this.openAppSecret = this.configService.get<string>(
      'OBB_OPEN_WECHAT_APP_SECRET',
      '',
    );
    this.oldAppId = this.configService.get<string>('OBB_WECHAT_OLD_APP_ID', '');
    this.oldAppSecret = this.configService.get<string>(
      'OBB_WECHAT_OLD_APP_SECRET',
      '',
    );
    this.oldOpenAppId = this.configService.get<string>(
      'OBB_OPEN_WECHAT_OLD_APP_ID',
      '',
    );
    this.oldOpenAppSecret = this.configService.get<string>(
      'OBB_OPEN_WECHAT_OLD_APP_SECRET',
      '',
    );
    this.redirectUri = this.configService.get<string>(
      'OBB_WECHAT_REDIRECT_URI',
      '',
    );
    this.migrationRedirectUri = this.configService.get<string>(
      'OBB_WECHAT_MIGRATION_REDIRECT_URI',
      '',
    );
  }

  available() {
    return {
      available: !!(
        this.appId &&
        this.openAppId &&
        this.appSecret &&
        this.openAppSecret &&
        this.redirectUri
      ),
    };
  }

  async getQrCodeParams() {
    const state = await this.socialService.generateState('open_weixin');
    return {
      state,
      appId: this.openAppId,
      scope: 'snsapi_login',
      redirectUri: encodeURIComponent(this.redirectUri),
    };
  }

  async authUrl(): Promise<string> {
    const state = await this.socialService.generateState('weixin');
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  async handleCallback(
    code: string,
    state: string,
    userId: string,
    lang?: string,
  ): Promise<any> {
    const stateInfo = await this.socialService.getState(state);
    if (!stateInfo) {
      const message = this.i18n.t('auth.errors.invalidStateIdentifier');
      throw new AppException(
        message,
        'INVALID_STATE_IDENTIFIER',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const isWeixin = stateInfo.type === 'weixin';
    const appId = isWeixin ? this.appId : this.openAppId;
    const appSecret = isWeixin ? this.appSecret : this.openAppSecret;
    const accessTokenResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`,
    );
    if (!accessTokenResponse.ok) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.oauthFailed', {
        args: { provider: providerName },
      });
      throw new AppException(message, 'OAUTH_FAILED', HttpStatus.UNAUTHORIZED);
    }
    const accessTokenData = await accessTokenResponse.json();

    if (accessTokenData.errmsg) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.invalidProviderData', {
        args: { provider: providerName },
      });
      throw new AppException(
        `${message}: ${accessTokenData.errmsg}`,
        'INVALID_WECHAT_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userDataResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessTokenData.access_token}&openid=${accessTokenData.openid}&lang=zh_CN`,
    );
    if (!userDataResponse.ok) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.failedToGetUserInfo', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'FAILED_TO_GET_USER_INFO',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const userData = await userDataResponse.json();

    if (userData.errmsg) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.invalidProviderData', {
        args: { provider: providerName },
      });
      throw new AppException(
        `${message}: ${userData.errmsg}`,
        'INVALID_WECHAT_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (userId) {
      const wechatUser = await this.userService.findByLoginId(userData.unionid);
      if (wechatUser) {
        if (wechatUser.id !== userId) {
          const providerName = this.i18n.t('auth.providers.wechat');
          const message = this.i18n.t('auth.errors.invalidProviderData', {
            args: { provider: providerName },
          });
          throw new AppException(
            message,
            'ACCOUNT_ALREADY_BOUND',
            HttpStatus.BAD_REQUEST,
          );
        }
        const returnValue = {
          isBinding: true,
          id: wechatUser.id,
          access_token: this.jwtService.sign({
            sub: wechatUser.id,
          }),
        };
        stateInfo.userInfo = returnValue;
        await this.socialService.updateState(state, stateInfo);
        return returnValue;
      }
      const existingUser = await this.userService.bindingExistUser({
        userId,
        loginType: 'wechat',
        loginId: userData.unionid,
        metadata: userData,
      });
      const returnValue = {
        isBinding: true,
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    }
    const wechatUser = await this.userService.findByLoginId(userData.unionid);
    if (wechatUser) {
      const returnValue = {
        id: wechatUser.id,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    }
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      const nickname: string = userData.nickname;
      const username: string = await this.socialService.getValidUsername(
        nickname,
        manager,
      );
      this.logger.debug({ nickname, username });
      const wechatUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'wechat',
          loginId: userData.unionid,
          lang,
          metadata: userData,
        } as CreateUserBindingDto,
        manager,
      );
      await this.namespaceService.createUserNamespace(
        wechatUser.id,
        wechatUser.username,
        tx,
      );
      const returnValue = {
        id: wechatUser.id,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    });
  }

  async migrationQrCode(type: 'new' | 'old' = 'new') {
    const isOld = type === 'old';
    const state = await this.socialService.generateState('open_weixin', type);
    return {
      state,
      appId: isOld ? this.oldOpenAppId : this.openAppId,
      scope: 'snsapi_login',
      redirectUri: encodeURIComponent(this.migrationRedirectUri),
    };
  }

  async migrationAuthUrl(type: 'new' | 'old' = 'new'): Promise<string> {
    const isOld = type === 'old';
    const state = await this.socialService.generateState('weixin', type);
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${isOld ? this.oldAppId : this.appId}&redirect_uri=${encodeURIComponent(this.migrationRedirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  async migrationCallback(
    code: string,
    state: string,
  ): Promise<WechatUserInfo> {
    const stateInfo = await this.socialService.getState(state);
    if (!stateInfo) {
      const message = this.i18n.t('auth.errors.invalidStateIdentifier');
      throw new AppException(
        message,
        'INVALID_STATE_IDENTIFIER',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const isOld = state.startsWith('old_');
    const isWeixin = stateInfo.type === 'weixin';
    const rawAppid = isOld ? this.oldAppId : this.appId;
    const rawAppsecret = isOld ? this.oldAppSecret : this.appSecret;
    const rawOpenAppid = isOld ? this.oldOpenAppId : this.openAppId;
    const rawOpenAppsecret = isOld ? this.oldOpenAppSecret : this.openAppSecret;
    const appId = isWeixin ? rawAppid : rawOpenAppid;
    const appSecret = isWeixin ? rawAppsecret : rawOpenAppsecret;
    const accessTokenResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`,
    );
    if (!accessTokenResponse.ok) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.oauthFailed', {
        args: { provider: providerName },
      });
      throw new AppException(message, 'OAUTH_FAILED', HttpStatus.UNAUTHORIZED);
    }
    const accessTokenData = await accessTokenResponse.json();

    if (accessTokenData.errmsg) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.invalidProviderData', {
        args: { provider: providerName },
      });
      throw new AppException(
        `${message}: ${accessTokenData.errmsg}`,
        'INVALID_WECHAT_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userDataResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessTokenData.access_token}&openid=${accessTokenData.openid}&lang=zh_CN`,
    );
    if (!userDataResponse.ok) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.failedToGetUserInfo', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'FAILED_TO_GET_USER_INFO',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const userData = await userDataResponse.json();

    if (userData.errmsg) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.invalidProviderData', {
        args: { provider: providerName },
      });
      throw new AppException(
        `${message}: ${userData.errmsg}`,
        'INVALID_WECHAT_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    return userData;
  }

  async migration(oldUnionid: string, newUnionid: string) {
    await this.userService.updateBinding(oldUnionid, newUnionid);
  }

  async unbind(userId: string) {
    const canDo = await this.socialService.canUnBinding(userId);
    if (!canDo) {
      const message = this.i18n.t('auth.errors.unbindingNotAllowed');
      throw new AppException(
        message,
        'UNBINDING_NOT_ALLOWED',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.userService.unbindByLoginType(userId, 'wechat');
  }
}
