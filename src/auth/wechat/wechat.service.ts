import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { WechatCheckResponseDto } from 'omniboxd/auth/dto/wechat-login.dto';
import { SocialService } from 'omniboxd/auth/social.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import { UserService } from 'omniboxd/user/user.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource } from 'typeorm';

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
  private readonly nativeAppId: string;
  private readonly nativeAppSecret: string;
  private readonly openAppId: string;
  private readonly openAppSecret: string;
  private readonly oldAppId: string;
  private readonly oldAppSecret: string;
  private readonly oldOpenAppId: string;
  private readonly oldOpenAppSecret: string;
  private readonly redirectUri: string;
  private readonly migrationRedirectUri: string;
  private readonly miniProgramAppId: string;
  private readonly miniProgramAppSecret: string;

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
    this.nativeAppId = this.configService.get<string>(
      'OBB_WECHAT_APP_NATIVE_ID',
      '',
    );
    this.nativeAppSecret = this.configService.get<string>(
      'OBB_WECHAT_APP_NATIVE_SECRET',
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

    this.miniProgramAppId = this.configService.get<string>(
      'OBB_MINI_PROGRAM_APP_ID',
      '',
    );
    this.miniProgramAppSecret = this.configService.get<string>(
      'OBB_MINI_PROGRAM_APP_SECRET',
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

  private hashDeviceToken(deviceToken: string): string {
    return createHash('sha256').update(deviceToken).digest('hex');
  }

  private isDeviceTokenValid(
    expectedHash: string | undefined,
    deviceToken: string | undefined,
  ): boolean {
    if (!expectedHash) {
      return true;
    }
    if (!deviceToken) {
      return false;
    }

    const actualHash = this.hashDeviceToken(deviceToken);
    const expected = Buffer.from(expectedHash);
    const actual = Buffer.from(actualHash);

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private assertDeviceToken(
    expectedHash: string | undefined,
    deviceToken: string | undefined,
  ) {
    if (this.isDeviceTokenValid(expectedHash, deviceToken)) {
      return;
    }

    const message = this.i18n.t('auth.errors.invalidStateIdentifier');
    throw new AppException(
      message,
      'INVALID_STATE_IDENTIFIER',
      HttpStatus.UNAUTHORIZED,
    );
  }

  async getQrCodeParams(redirectUrl?: string) {
    const state = await this.socialService.generateState(
      'open_weixin',
      '',
      '',
      redirectUrl,
    );
    return {
      state,
      appId: this.openAppId,
      scope: 'snsapi_login',
      redirectUri: encodeURIComponent(this.redirectUri),
    };
  }

  async authUrl(
    source: 'h5' | 'web' = 'web',
    h5Redirect?: string,
    redirectUrl?: string,
    existingState?: string,
    deviceToken?: string,
  ): Promise<string> {
    let state: string;

    if (existingState) {
      const existingStateInfo =
        await this.socialService.getState(existingState);
      if (!existingStateInfo || existingStateInfo.type !== 'weixin') {
        const message = this.i18n.t('auth.errors.invalidStateIdentifier');
        throw new AppException(
          message,
          'INVALID_STATE_IDENTIFIER',
          HttpStatus.UNAUTHORIZED,
        );
      }
      state = existingState;
      existingStateInfo['source'] = source;
      if (h5Redirect) {
        existingStateInfo['h5_redirect'] = h5Redirect;
      }
      if (redirectUrl) {
        existingStateInfo.redirectUrl = redirectUrl;
      }
      if (deviceToken) {
        existingStateInfo.deviceTokenHash = this.hashDeviceToken(deviceToken);
      }
      await this.socialService.updateState(state, existingStateInfo);
    } else {
      state = await this.socialService.generateState(
        'weixin',
        '',
        '',
        redirectUrl,
      );
      const stateInfo = await this.socialService.getState(state);
      if (stateInfo) {
        stateInfo['source'] = source;
        if (deviceToken) {
          stateInfo.deviceTokenHash = this.hashDeviceToken(deviceToken);
        }
        if (h5Redirect) {
          stateInfo['h5_redirect'] = h5Redirect;
        }
        await this.socialService.updateState(state, stateInfo);
      }
    }

    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  async checkState(
    state: string,
    deviceToken?: string,
  ): Promise<WechatCheckResponseDto> {
    const stateInfo = await this.socialService.getState(state);
    if (!stateInfo) {
      return { status: 'expired' };
    }
    this.assertDeviceToken(stateInfo.deviceTokenHash, deviceToken);

    const userInfo = stateInfo.userInfo as
      | { id?: string; access_token?: string }
      | undefined;
    if (userInfo?.id && userInfo?.access_token) {
      await this.socialService.deleteState(state);
      return {
        status: 'success',
        user: {
          id: userInfo.id,
          access_token: userInfo.access_token,
        },
      };
    }

    return { status: 'pending' };
  }

  async completeMiniProgramState(
    state: string,
    code: string,
    lang?: string,
    deviceToken?: string,
  ): Promise<{ id: string; access_token: string }> {
    const stateInfo = await this.socialService.getState(state);
    if (!stateInfo || stateInfo.type !== 'weixin') {
      const message = this.i18n.t('auth.errors.invalidStateIdentifier');
      throw new AppException(
        message,
        'INVALID_STATE_IDENTIFIER',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertDeviceToken(stateInfo.deviceTokenHash, deviceToken);

    const userInfo = stateInfo.userInfo as
      | { id?: string; access_token?: string }
      | undefined;
    if (userInfo?.id && userInfo?.access_token) {
      return {
        id: userInfo.id,
        access_token: userInfo.access_token,
      };
    }

    const loginData = await this.resolveMiniProgramLogin(code, lang);
    stateInfo.userInfo = {
      id: loginData.id,
      access_token: loginData.access_token,
    };
    await this.socialService.updateState(state, stateInfo);
    return stateInfo.userInfo;
  }

  async completeState(
    state: string,
    userId: string,
    accessToken: string,
    deviceToken?: string,
  ): Promise<void> {
    const stateInfo = await this.socialService.getState(state);
    if (!stateInfo || stateInfo.type !== 'weixin') {
      const message = this.i18n.t('auth.errors.invalidStateIdentifier');
      throw new AppException(
        message,
        'INVALID_STATE_IDENTIFIER',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertDeviceToken(stateInfo.deviceTokenHash, deviceToken);

    const userInfo = stateInfo.userInfo as
      | { id?: string; access_token?: string }
      | undefined;
    if (userInfo?.id && userInfo?.access_token) {
      return;
    }

    stateInfo.userInfo = {
      id: userId,
      access_token: accessToken,
    };
    await this.socialService.updateState(state, stateInfo);
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
    const userData = await this.fetchWechatUserData(appId, appSecret, code);

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
        // Update metadata if it's empty to ensure openid is available for payments
        await this.userService.updateUserBindingWhenMetadataEmpty(
          wechatUser.id,
          'wechat',
          userData,
        );
        const returnValue = {
          isBinding: true,
          id: wechatUser.id,
          access_token: this.jwtService.sign({
            sub: wechatUser.id,
            username: wechatUser.username,
          }),
          source: stateInfo['source'] || 'web',
          h5_redirect: stateInfo['h5_redirect'],
          redirectUrl: stateInfo.redirectUrl,
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
          username: existingUser.username,
        }),
        source: stateInfo['source'] || 'web',
        h5_redirect: stateInfo['h5_redirect'],
        redirectUrl: stateInfo.redirectUrl,
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
          username: wechatUser.username,
        }),
        source: stateInfo['source'] || 'web',
        h5_redirect: stateInfo['h5_redirect'],
        redirectUrl: stateInfo.redirectUrl,
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
          username: wechatUser.username,
        }),
        source: stateInfo['source'] || 'web',
        h5_redirect: stateInfo['h5_redirect'],
        redirectUrl: stateInfo.redirectUrl,
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    });
  }

  private async fetchWechatUserData(
    appId: string,
    appSecret: string,
    code: string,
  ): Promise<WechatUserInfo> {
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

  async nativeLogin(
    code: string,
    source?: string,
    lang?: string,
  ): Promise<any> {
    const userData = await this.fetchWechatUserData(
      this.nativeAppId || this.appId,
      this.nativeAppSecret || this.appSecret,
      code,
    );

    const wechatUser = await this.userService.findByLoginId(userData.unionid);
    if (wechatUser) {
      return {
        id: wechatUser.id,
        username: wechatUser.username,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
          username: wechatUser.username,
        }),
        source: source || 'native_ios',
      };
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      const nickname: string = userData.nickname;
      const username: string = await this.socialService.getValidUsername(
        nickname,
        manager,
      );
      this.logger.debug({ nickname, username });
      const createdUser = await this.userService.createUserBinding(
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
        createdUser.id,
        createdUser.username,
        tx,
      );
      return {
        id: createdUser.id,
        username: createdUser.username,
        access_token: this.jwtService.sign({
          sub: createdUser.id,
          username: createdUser.username,
        }),
        source: source || 'native_ios',
      };
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

  private async resolveMiniProgramLogin(
    code: string,
    lang?: string,
  ): Promise<any> {
    if (!this.miniProgramAppId || !this.miniProgramAppSecret) {
      const message = this.i18n.t('auth.errors.miniProgramNotConfigured', {
        defaultValue: 'WeChat MiniProgram is not configured',
      });
      throw new AppException(
        message,
        'MINI_PROGRAM_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const jscode2sessionResponse = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${this.miniProgramAppId}&secret=${this.miniProgramAppSecret}&js_code=${code}&grant_type=authorization_code`,
    );

    if (!jscode2sessionResponse.ok) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.oauthFailed', {
        args: { provider: providerName },
      });
      throw new AppException(message, 'OAUTH_FAILED', HttpStatus.UNAUTHORIZED);
    }

    const sessionData = await jscode2sessionResponse.json();
    if (sessionData.errcode) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.invalidProviderData', {
        args: { provider: providerName },
      });
      throw new AppException(
        `${message}: ${sessionData.errmsg}`,
        'INVALID_WECHAT_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!sessionData.openid) {
      const providerName = this.i18n.t('auth.providers.wechat');
      const message = this.i18n.t('auth.errors.invalidProviderData', {
        args: { provider: providerName },
      });
      throw new AppException(
        `${message}: missing openid`,
        'INVALID_WECHAT_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    const loginId = sessionData.unionid
      ? sessionData.unionid
      : `miniprogram_${sessionData.openid}`;

    const wechatUser = await this.userService.findByLoginId(loginId);

    if (wechatUser) {
      await this.userService.updateBindingMetadata(loginId, {
        mini_program_openid: sessionData.openid,
      });

      return {
        id: wechatUser.id,
        username: wechatUser.username,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
        }),
      };
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const nickname: string =
        sessionData?.nickname || `wx_${sessionData.openid.substring(0, 10)}`;
      const username: string = await this.socialService.getValidUsername(
        nickname,
        manager,
      );
      this.logger.debug({ username });
      const wechatUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'wechat',
          loginId: loginId,
          lang,
          metadata: {
            ...sessionData,
            mini_program_openid: sessionData.openid,
          },
        } as CreateUserBindingDto,
        manager,
      );
      await this.namespaceService.createUserNamespace(
        wechatUser.id,
        wechatUser.username,
        tx,
      );
      return {
        id: wechatUser.id,
        username: wechatUser.username,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
        }),
      };
    });
  }

  async miniProgramLogin(code: string, lang?: string): Promise<any> {
    return this.resolveMiniProgramLogin(code, lang);
  }
}
